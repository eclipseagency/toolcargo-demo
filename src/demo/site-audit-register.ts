import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { SITE_AUDIT_TOOLS } from "@/lib/catalog/connectors";
import { billableTool, toolMeta } from "@/lib/mcp/hosted";
import { auditPage, checkCrawlRules, checkLinks, checkSocialPreview } from "@/lib/connectors/site-audit/tools";

/**
 * Demo registration for the Site Audit core. Production registers the same tools
 * behind quota metering, per-site burst limits and saved history; the demo runs
 * the audit logic directly and omits the multi-page audit_site tool.
 */
const urlField = z.string().min(3).max(2048).describe("Public page URL, e.g. https://example.com/pricing. A bare domain is treated as https://.");

export function registerSiteAuditDemo(server: McpServer) {
  server.registerTool("audit_page", { ...toolMeta(SITE_AUDIT_TOOLS, "audit_page"), inputSchema: z.object({ url: urlField }) },
    billableTool("site-audit", "audit_page", async ({ url }: { url: string }) => (await auditPage(url)).markdown));
  server.registerTool("check_links", { ...toolMeta(SITE_AUDIT_TOOLS, "check_links"), inputSchema: z.object({ url: urlField, scope: z.enum(["all", "internal", "external"]).default("all"), max_links: z.number().int().min(1).max(25).default(10) }) },
    billableTool("site-audit", "check_links", async ({ url, scope, max_links }: { url: string; scope: "all" | "internal" | "external"; max_links: number }) => (await checkLinks(url, { maxLinks: max_links, scope })).markdown));
  server.registerTool("check_crawl_rules", { ...toolMeta(SITE_AUDIT_TOOLS, "check_crawl_rules"), inputSchema: z.object({ url: urlField, user_agent: z.string().min(2).max(60).default("Googlebot") }) },
    billableTool("site-audit", "check_crawl_rules", async ({ url, user_agent }: { url: string; user_agent: string }) => (await checkCrawlRules(url, user_agent)).markdown));
  server.registerTool("check_social_preview", { ...toolMeta(SITE_AUDIT_TOOLS, "check_social_preview"), inputSchema: z.object({ url: urlField }) },
    billableTool("site-audit", "check_social_preview", async ({ url }: { url: string }) => (await checkSocialPreview(url)).markdown));
}
