import { McpServer } from "@modelcontextprotocol/server";
import { registerCrossref } from "@/lib/connectors/crossref/register";
import { registerEuropePmc } from "@/lib/connectors/europe-pmc/register";
import { registerPypiPackages } from "@/lib/connectors/pypi-packages/register";
import { registerSiteAuditDemo } from "@/demo/site-audit-register";
import { installDemoMode } from "@/demo/offline";

/** One MCP server exposing the demo connectors (production hosts one endpoint per connector). */
export function createDemoServer(): McpServer {
  installDemoMode();
  const server = new McpServer({ name: "toolcargo-demo", version: "1.0.0" });
  registerCrossref(server);
  registerEuropePmc(server);
  registerPypiPackages(server);
  registerSiteAuditDemo(server);
  return server;
}
