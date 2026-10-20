import { createServer, type IncomingMessage } from "node:http";
import { connectDemoClient } from "@/mcp/client";
import { demoMode } from "@/demo/offline";
import { CROSSREF_CONNECTOR } from "@/lib/connectors/crossref/metadata";
import { EUROPE_PMC_CONNECTOR } from "@/lib/connectors/europe-pmc/metadata";
import { PYPI_PACKAGES_CONNECTOR } from "@/lib/connectors/pypi-packages/metadata";
import { PAGE } from "./page";

/** Local demo UI: a connector catalogue and a playground that calls tools over MCP. Binds to localhost only. */
const PORT = Number(process.env.PORT ?? 3000);
const client = await connectDemoClient();
const connectors = [
  { slug: "site-audit", name: "Site Audit", icon: "SA", tagline: "Check a page for indexing, metadata, link and social-preview problems.", tools: ["audit_page", "check_links", "check_crawl_rules", "check_social_preview"] },
  ...[CROSSREF_CONNECTOR, EUROPE_PMC_CONNECTOR, PYPI_PACKAGES_CONNECTOR].map((c) => ({ slug: c.slug, name: c.name, icon: c.icon, tagline: c.tagline, tools: c.tools.map((t) => t.name) })),
];

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 16_384) throw new Error("Request body too large.");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const headers = { "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff" };

const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);

createServer(async (req, res) => {
  const send = (status: number, type: string, body: string) => { res.writeHead(status, { ...headers, "content-type": type }); res.end(body); };
  // Localhost-only guards: reject DNS-rebinding hosts and cross-origin browser requests.
  if (!allowedHosts.has(req.headers.host ?? "")) return send(421, "text/plain", "Unexpected Host header.");
  const origin = req.headers.origin;
  if (origin !== undefined && !allowedHosts.has(origin.replace(/^http:\/\//, ""))) return send(403, "text/plain", "Cross-origin requests are not allowed.");
  try {
    if (req.method === "GET" && req.url === "/") return send(200, "text/html; charset=utf-8", PAGE);
    if (req.method === "GET" && req.url === "/api/catalog") {
      const { tools } = await client.listTools();
      return send(200, "application/json", JSON.stringify({ mode: demoMode(), connectors, tools }));
    }
    if (req.method === "POST" && req.url === "/api/call") {
      if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return send(415, "application/json", JSON.stringify({ error: "Use Content-Type: application/json." }));
      const body = (await readJson(req)) as { name?: unknown; arguments?: unknown };
      if (typeof body.name !== "string" || typeof body.arguments !== "object" || body.arguments === null) return send(400, "application/json", JSON.stringify({ error: "Expected { name, arguments }." }));
      const result = await client.callTool({ name: body.name, arguments: body.arguments as Record<string, unknown> });
      return send(200, "application/json", JSON.stringify(result));
    }
    send(404, "text/plain", "Not found");
  } catch (err) {
    send(400, "application/json", JSON.stringify({ error: err instanceof Error ? err.message : "Request failed." }));
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`ToolCargo demo (${demoMode()} mode) at http://127.0.0.1:${PORT}`);
});
