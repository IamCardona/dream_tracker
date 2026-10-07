import dns from "node:dns";
import dnsPromises from "node:dns/promises";

/**
 * Corrige la configuración DNS de Node.js en desarrollo local.
 *
 * PROBLEMA:
 * Cuando el DNS del sistema es una dirección IPv6 link-local (ej. `fe80::1`,
 * típico de routers domésticos que anuncian DNS vía IPv6 RA), Node.js no puede
 * usarla porque c-ares requiere un scope-id que Windows no expone. Node entonces
 * cae silenciosamente a `127.0.0.1`, donde no hay ningún servidor DNS escuchando.
 *
 * RESULTADO:
 * Toda consulta DNS falla con `ECONNREFUSED` de inmediato. Esto rompe
 * `mongodb+srv://` porque requiere una consulta SRV (`querySrv`) para
 * descubrir los nodos del cluster de Atlas.
 *
 * SOLUCIÓN:
 * Detectar configuraciones DNS inutilizables y reemplazarlas por resolvers
 * públicos confiables (Cloudflare y Google), que sí soportan registros SRV.
 *
 * IMPORTANTE:
 * `node:dns` y `node:dns/promises` mantienen resolvers internos SEPARADOS.
 * Llamar a `setServers()` en uno NO afecta al otro. El driver de MongoDB usa
 * la API de promesas, así que hay que configurar AMBOS módulos.
 *
 * Solo se aplica fuera de producción: en servidores reales el DNS siempre
 * está bien configurado y no se debe tocar.
 */

/** Resolvers públicos con soporte completo de SRV. */
const FALLBACK_DNS_SERVERS = [
  "1.1.1.1", // Cloudflare primario
  "8.8.8.8", // Google primario
  "1.0.0.1", // Cloudflare secundario
  "8.8.4.4", // Google secundario
];

/**
 * Un servidor DNS es inutilizable por Node si:
 *  - es loopback (127.x.x.x o ::1) → normalmente no hay resolver local escuchando
 *  - es IPv6 link-local (fe80::/10) sin scope-id → c-ares no puede usarlo
 *  - está vacío / malformado
 */
function isUnusableServer(server: string): boolean {
  const address = server.trim().toLowerCase();
  if (!address) return true;

  // Quitar corchetes y puerto de formatos tipo [::1]:53
  const bare = address.replace(/^\[/, "").replace(/\](?::\d+)?$/, "");

  if (bare === "::1") return true;
  if (/^127\./.test(bare)) return true;
  if (/^fe80:/.test(bare) && !bare.includes("%")) return true;

  return false;
}

/**
 * Aplica la lista de servidores a AMBOS resolvers de Node
 * (`node:dns` y `node:dns/promises`), que son independientes entre sí.
 */
function applyToBothResolvers(servers: string[]): void {
  dns.setServers(servers);
  dnsPromises.setServers(servers);
}

let alreadyConfigured = false;

export function ensureUsableDnsServers(): void {
  // Nunca tocar el DNS en producción
  if (process.env.NODE_ENV === "production") return;
  // Idempotente: solo se ejecuta una vez por proceso
  if (alreadyConfigured) return;
  alreadyConfigured = true;

  // Permitir override manual vía variable de entorno
  const override = process.env.MONGODB_DNS_SERVERS?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (override?.length) {
    try {
      applyToBothResolvers(override);
      console.log("DNS: usando servidores configurados manualmente:", override.join(", "));
    } catch (error) {
      console.error("DNS: MONGODB_DNS_SERVERS tiene un valor inválido:", error);
    }
    return;
  }

  let currentServers: string[] = [];
  try {
    currentServers = dns.getServers();
  } catch {
    currentServers = [];
  }

  const hasUsableServer =
    currentServers.length > 0 && currentServers.some((s) => !isUnusableServer(s));

  if (hasUsableServer) return; // El DNS del sistema sirve, no hacemos nada

  try {
    applyToBothResolvers(FALLBACK_DNS_SERVERS);
    console.log(
      `DNS: configuración del sistema inutilizable (${
        currentServers.join(", ") || "vacía"
      }). Usando resolvers públicos: ${FALLBACK_DNS_SERVERS.join(", ")}`,
    );
  } catch (error) {
    console.error("DNS: no se pudieron establecer los servidores de respaldo:", error);
  }
}
