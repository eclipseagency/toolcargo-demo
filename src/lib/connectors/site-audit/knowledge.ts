import type { Finding } from "./types";

/**
 * "Why it matters" for each check, keyed by finding id (or id prefix for
 * families like jsonld-*). Plain statements of mechanism — no ranking promises.
 */
const WHY: Record<string, string> = {
  "http-status": "Search engines drop pages that return errors, and visitors from links or ads land on a broken page.",
  "redirect-chain": "Each hop adds latency and loses some link signals; crawlers may stop following long chains.",
  "response-time": "Slow HTML delays everything else on the page. This is one server-side fetch, not a real-user speed measurement.",
  "html-size": "Very large HTML is slower to download and parse, and crawlers may stop reading before the end.",
  "content-type": "Browsers and crawlers decide how to handle a response from its Content-Type; a wrong type can stop the page being treated as HTML.",
  noindex: "A noindex directive tells search engines not to show the page in results at all.",
  canonical: "The canonical tells search engines which URL to index. A missing, relative or conflicting one can split or misdirect indexing.",
  title: "The title is the main headline in search results and browser tabs; missing or truncated titles lose clicks.",
  "title-count": "With several <title> elements, which one is used is unpredictable.",
  "meta-description": "Search engines often use it as the snippet under the title; without one they pick text themselves.",
  "meta-description-count": "Several descriptions give search engines conflicting summaries.",
  lang: "The language attribute helps screen readers pronounce text and helps language detection.",
  viewport: "Without a viewport tag, phones render the desktop layout zoomed out, which hurts mobile usability.",
  h1: "A single clear main heading tells readers and crawlers what the page is about.",
  "heading-order": "Skipped heading levels make the structure harder to follow for screen-reader users.",
  "img-alt": "Alt text describes images to screen-reader users and to search engines when the image can't be seen.",
  "thin-content": "If the served HTML contains little text, crawlers that don't run JavaScript see an almost empty page.",
  "og-tags": "Social platforms and chat apps build link previews from Open Graph tags; without them previews are plain or wrong.",
  "og-image-absolute": "Most platforms can't resolve a relative image path, so the preview shows no image.",
  "twitter-card": "X uses twitter:card to decide between a small and a large preview.",
  "og-image-status": "If the preview image doesn't load, every share of the page shows no image.",
  "og-image-type": "Platforms only accept real image files for previews.",
  "og-image-size": "Several platforms reject preview images over 5 MB.",
  "og-image-dims": "Small images are shown as thumbnails or dropped from large link cards.",
  "og-image-ratio": "Large cards are about 1.91:1; other shapes get cropped.",
  "og-image-svg": "Most platforms don't render SVG previews.",
  "og-image-fetch": "If the preview image can't be fetched, platforms show the link without an image.",
  "og-title-length": "Long preview titles are cut off in link cards.",
  "og-desc-length": "Link cards show only about two lines of description.",
  "jsonld-parse": "Search engines ignore a JSON-LD block entirely if it isn't valid JSON.",
  "jsonld-context": "Without @context the vocabulary is undefined, so the data may be ignored.",
  jsonld: "Rich results need the type's required properties; missing ones make the markup ineligible.",
  "structured-data": "Structured data can make pages eligible for richer search results when it matches visible content.",
  "hreflang-self": "Every page in an hreflang set must list itself, or the set may be ignored.",
  "hreflang-default": "x-default tells search engines which version to show users who match no listed language.",
  "hreflang-codes": "Invalid language codes make the hreflang annotations unusable.",
  hreflang: "Correct hreflang helps search engines show the right language version.",
  https: "Browsers mark plain HTTP pages as not secure, and HTTPS is expected for any modern site.",
  "security-headers": "These headers reduce common browser attack risks. They are hygiene, not a ranking factor.",
  "robots-allowed": "If robots.txt blocks a crawler, it can't read the page, so its content won't be indexed properly.",
  "robots-5xx": "When robots.txt errors, search engines may pause crawling the whole site.",
  "robots-missing": "Without robots.txt everything is crawlable, which is fine unless something should be excluded.",
  "robots-fetch": "We couldn't read robots.txt, so crawl rules for this page are unknown.",
  sitemap: "Sitemaps help search engines discover and prioritise pages; important pages should be listed.",
  "page-fetch": "Page-level directives couldn't be read, so indexability is only partly known.",
  "blocked": "The site answered with a block or bot challenge, so we saw a gatekeeper page instead of the real one.",
  "page-content": "Page-level checks need the page's own HTML.",
};

function whyFor(id: string): string | undefined {
  if (WHY[id]) return WHY[id];
  const prefix = Object.keys(WHY)
    .filter((k) => id.startsWith(`${k}-`) || id.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? WHY[prefix] : undefined;
}

/**
 * Evidence often quotes the audited page (titles, headings, tag values). That text is
 * untrusted: strip control characters and markup-looking sequences, collapse whitespace
 * and cap the length so a page can't smuggle long instructions into an assistant's context.
 */
export function sanitizeEvidence(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const clean = raw
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "")
    .replace(/`{3,}/g, "``")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 300 ? `${clean.slice(0, 297)}…` : clean;
}

/** Fills status, evidence (from legacy `detail`), why; keeps `detail` as an alias. */
export function enrich(findings: Finding[]): Finding[] {
  return findings.map((f) => {
    const evidence = sanitizeEvidence(f.evidence ?? f.detail);
    const status = f.status ?? (f.severity === "pass" ? "pass" : "fail");
    return {
      ...f,
      status,
      evidence,
      detail: evidence,
      why: status === "fail" ? (f.why ?? whyFor(f.id)) : f.why,
    };
  });
}
