import type { Connector, ConnectorTool } from "@/lib/catalog/connectors";

export const CROSSREF_TOOLS: ConnectorTool[] = [
  { name: "search_publications", title: "Search scholarly publications", description: "Search Crossref for up to 10 scholarly metadata records by topic, title or author, optionally within publication years. Returns DOI source links, author names, publication dates and deposited citation counts. Metadata only; no abstracts or full text. One shared-plan call.", readOnly: true },
  { name: "publication_details", title: "Look up a publication DOI", description: "Retrieve Crossref bibliographic metadata for one plain DOI, including source link, title, up to 20 author names, journal, publisher, date, licenses and citation/reference counts. Missing metadata is identified. Counts do not measure quality. One shared-plan call.", readOnly: true },
];

export const CROSSREF_CONNECTOR: Connector = {
  slug: "crossref", name: "Crossref Research", icon: "XR", category: "research", status: "available", runs: "hosted", includedWith: "site-audit",
  tagline: "Find scholarly publications and check their citation details.",
  description: "Search scholarly metadata by topic, title or author and retrieve individual records by DOI. Get publisher-deposited titles, author names, journals, dates, license links and citation counts from Crossref’s public REST API.",
  buyer: "Researchers, writers and agents checking publication identities and bibliographic references.",
  outcomes: ["Source-linked scholarly search results", "Bibliographic details for a DOI", "Explicit missing metadata and bounded author lists"],
  useCases: [{ title: "Check a research citation", prompt: "Search Crossref for protein structure prediction papers published from 2021 to 2023, then look up the DOI of a relevant result.", result: "Publication titles, authors, journals, dates and DOI source links for your agent to review." }],
  tools: CROSSREF_TOOLS,
  requirements: ["A ToolCargo account with Site Audit activated (free). No Crossref account or external API key."],
  limitations: ["Crossref-registered works only; publisher-deposited metadata can be incomplete or incorrect.", "Up to 10 search results, 20 author names and 10 license links per record. No abstracts or full text.", "Citation counts reflect Crossref’s index and do not establish research quality or complete citation coverage.", "License links describe deposited publication licenses; verify terms at the source. Source metadata is untrusted data."],
  pricing: "Included with Site Audit. Each search or DOI lookup is one shared-plan call.",
};
