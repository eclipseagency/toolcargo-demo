import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { connectDemoClient } from "@/mcp/client";

// End-to-end over MCP in offline mode: no network, synthetic fixtures only.
let client: Client;
const realFetch = globalThis.fetch;
beforeAll(async () => { delete process.env.TOOLCARGO_DEMO_MODE; client = await connectDemoClient(); });
afterAll(async () => { await client.close(); globalThis.fetch = realFetch; });
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: (r.content as { type: string; text: string }[]).map((c) => c.text).join("\n"), isError: Boolean(r.isError) };
};

describe("demo MCP server (offline)", () => {
  it("lists the demo tools with read-only annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "audit_page", "check_crawl_rules", "check_links", "check_social_preview", "compare_python_packages",
      "europe_pmc_publication_details", "europe_pmc_search_publications", "publication_details", "python_package_details", "search_publications",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });
  it("answers Crossref, Europe PMC and PyPI tools from fixtures", async () => {
    expect(JSON.parse((await call("publication_details", { doi: "10.5555/demo.2024.001" })).text.split("\n\nSource:")[0]).journal).toBe("Journal of Demonstration Data");
    expect((await call("search_publications", { query: "connector reliability", limit: 2 })).text).toContain("\"returned\": 2");
    expect((await call("europe_pmc_publication_details", { source: "MED", id: "90000001" })).text).toContain("Offline fixtures for reproducible API demos");
    expect((await call("compare_python_packages", { names: ["alpha-demo", "beta-demo"] })).text).toContain("\"latestVersion\": \"1.4.0\"");
  });
  it("audits the synthetic page and reports real findings", async () => {
    const r = await call("audit_page", { url: "https://example.com/" });
    expect(r.isError).toBe(false);
    expect(r.text).toMatch(/h1|heading/i);
    expect(r.text).toMatch(/meta description/i);
    expect((await call("check_links", { url: "https://example.com/", scope: "internal", max_links: 10 })).text).toMatch(/404|broken/i);
    expect((await call("check_crawl_rules", { url: "https://example.com/", user_agent: "Googlebot" })).text).toMatch(/Googlebot is allowed to crawl/);
  });
  it("keeps validation and SSRF protection in front of the offline transport", async () => {
    expect((await call("publication_details", { doi: "https://doi.org/10.1/x" })).isError).toBe(true);
    const local = await call("audit_page", { url: "http://127.0.0.1/" });
    expect(local.isError).toBe(true);
    expect((await call("audit_page", { url: "http://localhost:8080/" })).isError).toBe(true);
  });
});
