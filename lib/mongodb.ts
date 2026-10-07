import { setServers } from "node:dns";
import mongoose from "mongoose";

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

function encodeCredential(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function getMongoUri() {
  const configuredUri =
    process.env.MONGODB_URI ?? process.env.MONGODB_URL ?? process.env.url;

  if (!configuredUri || !/^mongodb(?:\+srv)?:\/\//i.test(configuredUri)) {
    throw new Error("A valid MongoDB connection URL is not configured.");
  }

  const username = process.env.MONGODB_USERNAME ?? process.env.username;
  const password = process.env.MONGODB_PASSWORD ?? process.env.password;
  const credentials = `${encodeCredential(username ?? "")}:${encodeCredential(password ?? "")}`;
  const uriWithAuth = configuredUri.match(
    /^(mongodb(?:\+srv)?:\/\/)([^/@]+)@(.+)$/i,
  );

  if (uriWithAuth) {
    let decodedUserInfo = uriWithAuth[2];
    try {
      decodedUserInfo = decodeURIComponent(decodedUserInfo);
    } catch {
      throw new Error("The MongoDB connection URL contains invalid encoding.");
    }

    if (/[<>]/.test(decodedUserInfo)) {
      if (!username || !password) {
        throw new Error("MongoDB credentials are required to connect to Atlas.");
      }

      return `${uriWithAuth[1]}${credentials}@${uriWithAuth[3]}`;
    }

    return configuredUri;
  }

  if (username || password) {
    if (!username || !password) {
      throw new Error("Both MongoDB username and password must be configured.");
    }

    return configuredUri.replace(
      /^(mongodb(?:\+srv)?:\/\/)/i,
      `$1${credentials}@`,
    );
  }

  return configuredUri;
}

function getDatabaseName(uri: string) {
  const configuredName = process.env.MONGODB_DATABASE;
  if (configuredName) return configuredName;

  const databasePath = uri.match(
    /^mongodb(?:\+srv)?:\/\/(?:[^/@]+@)?[^/?#]+\/([^/?#]+)/i,
  )?.[1];

  if (databasePath) {
    try {
      return decodeURIComponent(databasePath);
    } catch {
      throw new Error("The MongoDB database name contains invalid encoding.");
    }
  }

  return "dream-tracker";
}

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const errorWithCode = error as Error & { code?: unknown };
  if (
    typeof errorWithCode.code === "string" &&
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(
      errorWithCode.code,
    )
  ) {
    return true;
  }

  if (
    /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|server selection timed out/i.test(
      error.message,
    )
  ) {
    return true;
  }

  return error.cause instanceof Error && isTransientConnectionError(error.cause);
}

async function connectWithRetry(uri: string) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await mongoose.connect(uri, {
        dbName: getDatabaseName(uri),
        serverSelectionTimeoutMS: 10_000,
      });
    } catch (error) {
      if (attempt === maxAttempts || !isTransientConnectionError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }

  throw new Error("MongoDB connection attempts were exhausted.");
}

const cache = globalThis.mongooseCache ?? {
  connection: null,
  promise: null,
};

globalThis.mongooseCache = cache;

export async function connectToDatabase() {
  if (cache.connection) return cache.connection;

  if (!cache.promise) {
    const configuredDnsServers = process.env.MONGODB_DNS_SERVERS
      ?.split(",")
      .map((server) => server.trim())
      .filter(Boolean);
    if (configuredDnsServers?.length) {
      setServers(configuredDnsServers);
    }

    const uri = getMongoUri();
    cache.promise = connectWithRetry(uri);
  }

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
}
