/**
 * instrumentation-node.ts
 * Se ejecuta una sola vez al arrancar el servidor Node.js (dev y prod).
 *
 * 1. Corrige la configuración DNS de Node lo antes posible, antes de que
 *    cualquier ruta intente resolver los registros SRV de MongoDB Atlas.
 * 2. Preconecta a MongoDB en producción para evitar el cold-start en la
 *    primera petición.
 */
import { ensureUsableDnsServers } from "./lib/dns-setup";
import { connectToDatabase } from "./lib/mongodb";

// Debe ejecutarse antes que cualquier otra cosa que use la red
ensureUsableDnsServers();

if (process.env.NODE_ENV === "production") {
  connectToDatabase().catch((error: unknown) => {
    console.error(
      "MongoDB: error al preconectar durante el arranque del servidor:",
      error instanceof Error ? { name: error.name, message: error.message } : error,
    );
  });
}

