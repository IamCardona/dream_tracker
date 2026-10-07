/**
 * instrumentation-node.ts
 * Se ejecuta una sola vez al arrancar el servidor Node.js (tanto en dev como en prod).
 * Preconecta a MongoDB en producción para que la primera petición no pague
 * el costo de cold-start de la conexión.
 */
import { connectToDatabase } from "./lib/mongodb";

if (process.env.NODE_ENV === "production") {
  connectToDatabase().catch((error: unknown) => {
    console.error(
      "MongoDB: error al preconectar durante el arranque del servidor:",
      error instanceof Error ? { name: error.name, message: error.message } : error,
    );
  });
}

