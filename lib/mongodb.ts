import mongoose from "mongoose";
import { ensureUsableDnsServers } from "./dns-setup";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

// ─── URI ──────────────────────────────────────────────────────────────────────

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;

  if (!uri || !/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error(
      "MONGODB_URI no está configurado o no tiene el formato correcto " +
        "(debe comenzar con mongodb:// o mongodb+srv://).",
    );
  }

  return uri;
}

// ─── Nombre de base de datos ──────────────────────────────────────────────────

function getDatabaseName(uri: string): string {
  if (process.env.MONGODB_DATABASE) return process.env.MONGODB_DATABASE;

  const match = uri.match(
    /^mongodb(?:\+srv)?:\/\/(?:[^/@]+@)?[^/?#]+\/([^/?#]+)/i,
  );

  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      throw new Error("El nombre de la base de datos en MONGODB_URI contiene codificación inválida.");
    }
  }

  return "dream-tracker";
}

// ─── Detección de errores transitorios ───────────────────────────────────────

const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ESERVFAIL",
  "EREFUSED",
  "ETIMEOUT",
]);

const TRANSIENT_PATTERN =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ESERVFAIL|EREFUSED|querySrv|queryTxt|server selection timed out|topology was destroyed/i;

/** Detecta específicamente fallos de resolución DNS SRV/TXT. */
function isDnsResolutionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/querySrv|queryTxt|ENODATA|ESERVFAIL|EREFUSED/i.test(error.message)) return true;
  return error.cause instanceof Error && isDnsResolutionError(error.cause);
}

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const withCode = error as Error & { code?: unknown };

  if (typeof withCode.code === "string" && TRANSIENT_CODES.has(withCode.code)) {
    return true;
  }
  if (TRANSIENT_PATTERN.test(error.message)) return true;
  return error.cause instanceof Error && isTransientConnectionError(error.cause);
}

// ─── Conexión con reintentos y backoff exponencial ───────────────────────────

const CONNECT_OPTIONS: mongoose.ConnectOptions = {
  // Tiempo máximo buscando un servidor disponible en el cluster
  serverSelectionTimeoutMS: 15_000,
  // Tiempo máximo para establecer un socket TCP
  connectTimeoutMS: 15_000,
  // Tiempo máximo esperando una operación en el socket abierto
  socketTimeoutMS: 45_000,
  // Latidos para detectar nodos caídos rápido
  heartbeatFrequencyMS: 10_000,
  // Pool de conexiones: suficiente para serverless sin saturar Atlas M0
  maxPoolSize: 10,
  minPoolSize: 0,
  // Reintentos automáticos de escritura (Atlas los soporta)
  retryWrites: true,
  // TLS requerido por Atlas
  tls: true,
  // Mantener el socket vivo para entornos serverless (Vercel, etc.)
  family: 4,
};

/**
 * Convierte una URI `mongodb+srv://` en una `mongodb://` directa resolviendo
 * manualmente los registros SRV y TXT.
 *
 * Se usa como último recurso cuando `querySrv` falla dentro del driver pero
 * la resolución manual sí funciona (típico cuando el driver usa un resolver
 * distinto al que configuramos con `setServers`).
 */
async function buildDirectUriFromSrv(srvUri: string): Promise<string> {
  const { resolveSrv, resolveTxt } = await import("node:dns/promises");

  const parsed = new URL(srvUri.replace(/^mongodb\+srv:\/\//i, "mongodb://"));
  const hostname = parsed.hostname;

  const srvRecords = await resolveSrv(`_mongodb._tcp.${hostname}`);
  if (!srvRecords.length) {
    throw new Error(`No se encontraron registros SRV para ${hostname}.`);
  }

  const hosts = srvRecords
    .map((record) => `${record.name}:${record.port}`)
    .join(",");

  // Los registros TXT de Atlas contienen opciones como authSource y replicaSet
  let txtOptions = "";
  try {
    const txtRecords = await resolveTxt(hostname);
    txtOptions = txtRecords.flat().join("&");
  } catch {
    // Si no hay TXT, continuamos sin esas opciones
  }

  const params = new URLSearchParams(parsed.search);
  if (txtOptions) {
    for (const [key, value] of new URLSearchParams(txtOptions)) {
      if (!params.has(key)) params.set(key, value);
    }
  }
  // mongodb+srv implica TLS; al pasar a mongodb:// hay que declararlo explícitamente
  if (!params.has("tls") && !params.has("ssl")) params.set("tls", "true");

  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
    : "";
  const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";

  return `mongodb://${auth}${hosts}${path}?${params.toString()}`;
}

async function connectWithRetry(uri: string): Promise<typeof mongoose> {
  const MAX_ATTEMPTS = 3;
  const dbName = getDatabaseName(uri);

  // Asegurar que Node tenga servidores DNS utilizables antes de resolver SRV
  ensureUsableDnsServers();

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await mongoose.connect(uri, { ...CONNECT_OPTIONS, dbName });
    } catch (error) {
      lastError = error;
      const isLast = attempt === MAX_ATTEMPTS;
      const isTransient = isTransientConnectionError(error);

      console.error(
        `MongoDB: intento ${attempt}/${MAX_ATTEMPTS} fallido.`,
        isTransient ? "(error transitorio)" : "(error permanente)",
        error instanceof Error ? { name: error.name, message: error.message } : error,
      );

      if (isLast || !isTransient) break;

      // Backoff exponencial: 500 ms, 1000 ms
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  // Último recurso: si el fallo fue de DNS SRV y la URI es +srv,
  // resolvemos los hosts manualmente y conectamos de forma directa.
  if (/^mongodb\+srv:\/\//i.test(uri) && isDnsResolutionError(lastError)) {
    console.warn(
      "MongoDB: la resolución SRV del driver falló. " +
        "Intentando conexión directa resolviendo los hosts manualmente...",
    );
    try {
      const directUri = await buildDirectUriFromSrv(uri);
      const connection = await mongoose.connect(directUri, {
        ...CONNECT_OPTIONS,
        dbName,
      });
      console.log("MongoDB: conectado mediante resolución SRV manual.");
      return connection;
    } catch (fallbackError) {
      console.error(
        "MongoDB: la conexión directa de respaldo también falló:",
        fallbackError instanceof Error
          ? { name: fallbackError.name, message: fallbackError.message }
          : fallbackError,
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Se agotaron todos los intentos de conexión a MongoDB.");
}

// ─── Cache global (sobrevive hot-reload en desarrollo) ────────────────────────

const cache: MongooseCache = globalThis.mongooseCache ?? {
  connection: null,
  promise: null,
};
globalThis.mongooseCache = cache;

// ─── Función principal exportada ─────────────────────────────────────────────

export async function connectToDatabase(): Promise<typeof mongoose> {
  // 1. Ya hay una conexión activa y abierta — reutilizarla directamente
  if (mongoose.connection.readyState === 1) {
    cache.connection = mongoose;
    return mongoose;
  }

  // 2. Hay un intento de conexión en curso (readyState === 2 = connecting)
  //    Esperar la promesa existente en lugar de lanzar otra conexión paralela
  if (cache.promise !== null) {
    try {
      cache.connection = await cache.promise;
      return cache.connection;
    } catch {
      // Si la promesa en vuelo falló, limpiar y reintentar abajo
      cache.promise = null;
      cache.connection = null;
    }
  }

  // 3. Sin conexión ni promesa en vuelo — desconectar limpiamente si hay
  //    una conexión en estado "closing" o "disconnected" para evitar
  //    que Mongoose use el socket anterior roto
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
    } catch {
      // ignorar errores al desconectar
    }
  }

  // 4. Lanzar nueva promesa de conexión
  const uri = getMongoUri();
  cache.promise = connectWithRetry(uri);

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    cache.connection = null;
    throw error;
  }
}

