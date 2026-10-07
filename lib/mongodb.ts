import mongoose from "mongoose";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
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
]);

const TRANSIENT_PATTERN =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EHOSTUNREACH|server selection timed out|topology was destroyed/i;

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

async function connectWithRetry(uri: string): Promise<typeof mongoose> {
  const MAX_ATTEMPTS = 3;
  const dbName = getDatabaseName(uri);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await mongoose.connect(uri, { ...CONNECT_OPTIONS, dbName });
    } catch (error) {
      const isLast = attempt === MAX_ATTEMPTS;
      const isTransient = isTransientConnectionError(error);

      console.error(
        `MongoDB: intento ${attempt}/${MAX_ATTEMPTS} fallido.`,
        isTransient ? "(error transitorio)" : "(error permanente)",
        error instanceof Error ? { name: error.name, message: error.message } : error,
      );

      if (isLast || !isTransient) throw error;

      // Backoff exponencial: 500 ms, 1000 ms
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  throw new Error("Se agotaron todos los intentos de conexión a MongoDB.");
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

