import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { billableTool, toolMeta } from "@/lib/mcp/hosted";
import { EUROPE_PMC_TOOLS } from "./metadata";
import { CURSOR_PATTERN, EUROPE_PMC_SOURCES, PUBLICATION_ID_PATTERN, publicationDetails, searchPublications, type EuropePmcSearch, type EuropePmcSource } from "./lookup";
const year = z.number().int().min(1000).max(2100).optional().describe("Inclusive first-publication year, 1000–2100.");
export function registerEuropePmc(server: McpServer) {
  server.registerTool("europe_pmc_search_publications", { ...toolMeta(EUROPE_PMC_TOOLS, "europe_pmc_search_publications"), inputSchema: z.object({ query: z.string().min(2).max(300).describe("Plain topic phrase, quoted and escaped literally. No query operators, e.g. gene editing."), limit: z.number().int().min(1).max(10).default(5), cursorMark: z.string().max(2000).regex(CURSOR_PATTERN).default("*").describe("* for the first page; copy nextCursorMark for another page, keeping query, filters and limit unchanged."), fromYear: year, toYear: year }) }, billableTool("europe-pmc", "europe_pmc_search_publications", (args: EuropePmcSearch) => searchPublications(args)));
  server.registerTool("europe_pmc_publication_details", { ...toolMeta(EUROPE_PMC_TOOLS, "europe_pmc_publication_details"), inputSchema: z.object({ source: z.enum(EUROPE_PMC_SOURCES).describe("Exact uppercase source code returned by search, e.g. MED."), id: z.string().max(100).regex(PUBLICATION_ID_PATTERN).describe("Exact plain ID returned by search. ID alone may not identify a unique publication across sources.") }) }, billableTool("europe-pmc", "europe_pmc_publication_details", (args: { source: EuropePmcSource; id: string }) => publicationDetails(args)));
}
