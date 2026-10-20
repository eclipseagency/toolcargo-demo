import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { billableTool, toolMeta } from "@/lib/mcp/hosted";
import { CROSSREF_TOOLS } from "./metadata";
import { DOI_PATTERN, publicationDetails, searchPublications, type PublicationSearch } from "./lookup";

const year = z.number().int().min(1000).max(2100).optional().describe("Inclusive publication year, from 1000 to 2100.");
export function registerCrossref(server: McpServer) {
  server.registerTool("search_publications", {
    ...toolMeta(CROSSREF_TOOLS, "search_publications"),
    inputSchema: z.object({
      query: z.string().min(2).max(300).describe("Topic, title or author name, e.g. protein structure prediction."),
      limit: z.number().int().min(1).max(10).default(5).describe("Maximum records returned (1–10)."),
      fromYear: year, toYear: year,
    }),
  }, billableTool("crossref", "search_publications", (args: PublicationSearch) => searchPublications(args)));
  server.registerTool("publication_details", {
    ...toolMeta(CROSSREF_TOOLS, "publication_details"),
    inputSchema: z.object({ doi: z.string().max(255).regex(DOI_PATTERN, "Use a plain DOI, without a URL or whitespace.").describe("Plain DOI, e.g. 10.1038/s41586-021-03819-2.") }),
  }, billableTool("crossref", "publication_details", (args: { doi: string }) => publicationDetails(args.doi)));
}
