import { setServers } from "node:dns";

const configuredDnsServers = process.env.MONGODB_DNS_SERVERS
  ?.split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (configuredDnsServers?.length) {
  setServers(configuredDnsServers);
}
