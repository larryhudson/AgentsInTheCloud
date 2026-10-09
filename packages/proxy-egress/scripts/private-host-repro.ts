// Repro for issue #37: a workspace asks the real egress proxy for a LAN host.
// Usage: env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy bun packages/proxy-egress/scripts/private-host-repro.ts <private-ip>
// (Unset inherited proxies when nested: Bun fetch would otherwise send through the parent proxy, which blocks LAN.)
// <private-ip> must be a local RFC1918 address (e.g. this machine's eth0) standing in for gitea.local.
// Without a template approval the proxy answers 403; after approving gitea.local
// it reaches the host, while other names, loopback and metadata stay blocked.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addWorkspaceTemplate, setWorkspaceTemplatePrivateHosts } from "@agents-in-the-cloud/workspace-templates";
import { startWorkspaceEgressProxy } from "../src/egress/egress-proxy.ts";
import { ensureMitmCa } from "../src/egress/mitm-ca.ts";
import { getWorkspaceSecretContext } from "../src/secrets/workspace-secrets.ts";

const lanIp = process.argv[2];
if (!lanIp || net.isIP(lanIp) !== 4) throw new Error("usage: private-host-repro.ts <private-ipv4>");
const dataDir = await mkdtemp(join(tmpdir(), "private-host-repro-"));
process.env.ATELIER_DATA_DIR = dataDir;

// Stand-ins for gitea.local: an HTTP API and a TLS-ish port reached through CONNECT.
const http = createServer((_req, res) => res.end("gitea says hi"));
await new Promise<void>((resolve) => http.listen(0, lanIp, resolve));
const httpPort = (http.address() as net.AddressInfo).port;
const tcp = net.createServer((socket) => socket.end("gitea:443 tunnel ok\n"));
await new Promise<void>((resolve) => tcp.listen(0, lanIp, resolve));
const tcpPort = (tcp.address() as net.AddressInfo).port;

const dns: Record<string, string> = { "gitea.local": lanIp, "other.local": lanIp, "sneaky.local": "127.0.0.1" };
const { workspaceTemplate } = await addWorkspaceTemplate("https://github.com/org/repo.git");
const init = { type: "project.git" as const, projectId: workspaceTemplate.id, name: "repo", gitUrl: "https://github.com/org/repo.git", branch: null, sessionShareKey: "repo" };
const socketPath = join(dataDir, "egress.sock");
const proxy = await startWorkspaceEgressProxy({
  socketPath, ca: await ensureMitmCa(), getContext: () => getWorkspaceSecretContext("repro", async () => init),
  upstreamDnsLookup: async (hostname) => dns[hostname] ? [{ address: dns[hostname]!, family: 4 }] : [],
  upstreamConnect: (port, address) => net.connect(port === 443 ? tcpPort : port, address),
  upstreamProxyForUrl: () => "", // This runs nested; talk to the LAN directly like a host install would.
});

const get = (host: string) => new Promise<string>((resolve, reject) => {
  const req = request({ socketPath, path: `http://${host}:${httpPort}/api/v1/version`, headers: { host: `${host}:${httpPort}` } }, (res) => {
    let body = ""; res.on("data", (c) => body += c); res.on("end", () => resolve(`${res.statusCode} ${body.trim().slice(0, 60)}`));
  });
  req.on("error", reject); req.end();
});
const connect = (host: string) => new Promise<string>((resolve, reject) => {
  const socket = net.connect(socketPath, () => socket.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`));
  let data = ""; socket.on("data", (c) => data += c); socket.on("error", reject);
  socket.on("close", () => resolve(data.replace(/\r\n\r\n/, " | ").split("\r\n")[0]!.trim()));
});
const run = async (label: string) => {
  console.log(`\n# ${label}`);
  for (const host of ["gitea.local", "other.local", "sneaky.local"]) {
    console.log(`GET     ${host.padEnd(13)} -> ${await get(host)}`);
    console.log(`CONNECT ${host.padEnd(13)} -> ${await connect(host)}`);
  }
};

await run("before: template has no private hosts");
await setWorkspaceTemplatePrivateHosts(workspaceTemplate.id, ["gitea.local", "sneaky.local"]);
await run("after: template approves gitea.local and sneaky.local (sneaky.local resolves to 127.0.0.1)");
await proxy.close(); http.close(); tcp.close();
await rm(dataDir, { recursive: true, force: true });
