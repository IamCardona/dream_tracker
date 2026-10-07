import { setServers } from "node:dns";

const configuredDnsServers =
  process.env.NODE_ENV === "development"
    ? process.env.MONGODB_DNS_SERVERS
        ?.split(",")
        .map((server) => server.trim())
        .filter(Boolean)
    : undefined;

if (configuredDnsServers?.length) {
  setServers(configuredDnsServers);
}
