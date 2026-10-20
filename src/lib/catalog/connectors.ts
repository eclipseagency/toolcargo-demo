// Subset of the production catalogue types used by the demo connectors.
export type CategorySlug =
  | "websites-seo"
  | "analytics"
  | "ads"
  | "messaging"
  | "invoicing"
  | "documents"
  | "design"
  | "files"
  | "research"
  | "developer";
export type ConnectorTool = {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
};

export type Connector = {
  slug: string;
  name: string;
  /** Two-letter mark shown on the store grid. */
  icon: string;
  category: CategorySlug;
  status: "available" | "planned";
  runs: "hosted" | "local-companion";
  tagline: string;
  description: string;
  buyer: string;
  outcomes: string[];
  useCases: { title: string; prompt: string; result: string }[];
  tools: ConnectorTool[];
  requirements: string[];
  limitations: string[];
  pricing: string;
  /** Connector included in another connector's plan. */
  includedWith?: string;
};

export const SITE_AUDIT_TOOLS: ConnectorTool[] = [
  {
    name: "audit_page",
    title: "Audit a page",
    description:
      "Fetch one public URL and check status, redirects, title, meta description, canonical, noindex, headings, image alt text, Open Graph tags, JSON-LD structured data, hreflang and HTTPS headers. Returns prioritised findings with fixes.",
    readOnly: true,
  },
  {
    name: "check_links",
    title: "Check links on a page",
    description:
      "Extract the links on a public page and test each one (HEAD, falling back to GET). Reports broken links, unreachable hosts and redirects that should be updated.",
    readOnly: true,
  },
  {
    name: "check_crawl_rules",
    title: "Check crawl and index rules",
    description:
      "Evaluate robots.txt for a given crawler, meta robots and X-Robots-Tag, the canonical link, and whether the URL appears in the site's XML sitemap. Answers: can this page be indexed?",
    readOnly: true,
  },
  {
    name: "audit_site",
    title: "Audit several pages of a site",
    description:
      "Audit the starting page plus more pages found in the site's XML sitemap (or its links), up to your plan's page limit. Returns the issues shared across pages and the weakest pages first. Each audited page counts as one call; pages that can't be fetched are not counted.",
    readOnly: true,
  },
  {
    name: "check_social_preview",
    title: "Check the social link preview",
    description:
      "Read Open Graph and Twitter card tags, fetch the preview image and check its type, size and dimensions. Shows what a shared link card will be built from.",
    readOnly: true,
  },
];
