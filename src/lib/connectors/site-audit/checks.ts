import type { AuditOutcome, Finding } from "./types";
import type { JsonLdBlock, PageFacts } from "./parse";

export type ResponseMeta = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirects: { url: string; status: number }[];
  headers: Record<string, string>;
  elapsedMs: number;
  bytes: number;
  truncated: boolean;
};

const normaliseUrl = (u: string) => {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
};

export function fetchChecks(r: ResponseMeta): Finding[] {
  const f: Finding[] = [];
  if (r.status >= 400) {
    f.push({ id: "http-status", area: "fetch", severity: "error", title: `Page returned HTTP ${r.status}`, evidence: `${r.finalUrl} answered HTTP ${r.status}`, fix: "Serve the page with a 200 status, or remove links to it." });
  } else {
    f.push({ id: "http-status", area: "fetch", severity: "pass", title: `HTTP ${r.status}` });
  }
  if (r.redirects.length > 1) {
    f.push({
      id: "redirect-chain",
      area: "fetch",
      severity: "warning",
      title: `Redirect chain of ${r.redirects.length} hops`,
      detail: [...r.redirects.map((h) => `${h.status} ${h.url}`), r.finalUrl].join(" → "),
      fix: "Link and redirect straight to the final URL.",
    });
  } else if (r.redirects.length === 1) {
    f.push({ id: "redirect-chain", area: "fetch", severity: "notice", title: `Redirected once (${r.redirects[0].status})`, detail: `${r.requestedUrl} → ${r.finalUrl}` });
  }
  if (r.elapsedMs > 3000) {
    f.push({ id: "response-time", area: "fetch", severity: "warning", title: `Slow response: ${r.elapsedMs} ms to fetch the HTML`, fix: "Check server response time and caching. This measures one fetch from our server, not real-user performance." });
  }
  if (r.truncated) {
    f.push({ id: "html-size", area: "fetch", severity: "warning", title: "HTML larger than 2 MB", detail: "Only the first 2 MB were analysed.", fix: "Very large HTML slows crawling and rendering; move inline data out of the page." });
  }
  const type = r.headers["content-type"] ?? "";
  if (!type.includes("html")) {
    f.push({ id: "content-type", area: "fetch", severity: "warning", title: `Content-Type is "${type || "missing"}"`, fix: "HTML pages should be served as text/html." });
  }
  return f;
}

export function indexingChecks(p: PageFacts, r: ResponseMeta): Finding[] {
  const f: Finding[] = [];
  const xRobots = (r.headers["x-robots-tag"] ?? "").toLowerCase();
  const noindex = p.robotsMeta.some((v) => v.includes("noindex") || v.includes("none")) || /noindex|\bnone\b/.test(xRobots);
  if (noindex) {
    f.push({
      id: "noindex",
      area: "indexing",
      severity: "error",
      title: "Page is marked noindex",
      detail: [p.robotsMeta.length ? `meta robots: ${p.robotsMeta.join(", ")}` : "", xRobots ? `X-Robots-Tag: ${xRobots}` : ""].filter(Boolean).join("; "),
      fix: "Remove noindex if this page should appear in search results. Ignore this if it is intentional.",
    });
  } else {
    f.push({ id: "noindex", area: "indexing", severity: "pass", title: "No noindex directive" });
  }

  if (p.canonicals.length === 0) {
    f.push({ id: "canonical", area: "indexing", severity: "warning", title: "No canonical link", evidence: "No <link rel=\"canonical\"> in the served HTML", fix: `Add <link rel="canonical" href="${r.finalUrl}"> (or the preferred URL).` });
  } else if (new Set(p.canonicals).size > 1) {
    f.push({ id: "canonical", area: "indexing", severity: "error", title: `${p.canonicals.length} conflicting canonical links`, detail: p.canonicals.join(", "), fix: "Keep exactly one canonical link." });
  } else {
    const canonical = p.canonicals[0];
    if (!/^https?:\/\//.test(canonical)) {
      f.push({ id: "canonical", area: "indexing", severity: "warning", title: "Canonical is not an absolute URL", detail: canonical });
    } else if (normaliseUrl(canonical) !== normaliseUrl(r.finalUrl)) {
      f.push({
        id: "canonical",
        area: "indexing",
        severity: noindex ? "error" : "notice",
        title: "Canonical points to a different URL",
        detail: `${canonical}${noindex ? " (combined with noindex, this sends conflicting signals)" : ""}`,
        fix: "Confirm this page is meant to consolidate into the canonical target.",
      });
    } else {
      f.push({ id: "canonical", area: "indexing", severity: "pass", title: "Self-referencing canonical" });
    }
  }
  return f;
}

export function metadataChecks(p: PageFacts): Finding[] {
  const f: Finding[] = [];
  if (!p.title) {
    f.push({ id: "title", area: "metadata", severity: "error", title: "Missing <title>", evidence: "No <title> element in the served HTML", fix: "Add a unique, descriptive title of roughly 30–60 characters." });
  } else if (p.title.length > 65) {
    f.push({ id: "title", area: "metadata", severity: "warning", title: `Title is ${p.title.length} characters`, detail: p.title, fix: "Search results usually truncate titles past ~60 characters; lead with the important words." });
  } else if (p.title.length < 15) {
    f.push({ id: "title", area: "metadata", severity: "warning", title: `Title is only ${p.title.length} characters`, detail: p.title, fix: "Describe the page's topic more specifically." });
  } else {
    f.push({ id: "title", area: "metadata", severity: "pass", title: `Title (${p.title.length} chars)`, detail: p.title });
  }
  if (p.titleCount > 1) {
    f.push({ id: "title-count", area: "metadata", severity: "warning", title: `${p.titleCount} <title> elements`, evidence: `${p.titleCount} <title> elements found`, fix: "Keep a single <title> in the head." });
  }

  if (!p.metaDescription) {
    f.push({ id: "meta-description", area: "metadata", severity: "warning", title: "Missing meta description", evidence: "No <meta name=\"description\"> tag in the served HTML", fix: "Add a 70–160 character summary; search engines may use it as the snippet." });
  } else if (p.metaDescription.length > 170) {
    f.push({ id: "meta-description", area: "metadata", severity: "notice", title: `Meta description is ${p.metaDescription.length} characters`, evidence: p.metaDescription.slice(0, 200), fix: "Snippets are usually cut around 155–160 characters." });
  } else if (p.metaDescription.length < 50) {
    f.push({ id: "meta-description", area: "metadata", severity: "notice", title: `Meta description is only ${p.metaDescription.length} characters`, detail: p.metaDescription });
  } else {
    f.push({ id: "meta-description", area: "metadata", severity: "pass", title: `Meta description (${p.metaDescription.length} chars)` });
  }
  if (p.metaDescriptionCount > 1) {
    f.push({ id: "meta-description-count", area: "metadata", severity: "warning", title: `${p.metaDescriptionCount} meta descriptions`, evidence: `${p.metaDescriptionCount} description tags found`, fix: "Keep one." });
  }

  if (!p.lang) {
    f.push({ id: "lang", area: "metadata", severity: "warning", title: "No lang attribute on <html>", evidence: "<html> has no lang attribute", fix: 'Add e.g. <html lang="en"> — it helps screen readers and language detection.' });
  } else {
    f.push({ id: "lang", area: "metadata", severity: "pass", title: `lang="${p.lang}"` });
  }
  if (!p.viewport) {
    f.push({ id: "viewport", area: "metadata", severity: "warning", title: "No viewport meta tag", evidence: "No <meta name=\"viewport\"> tag", fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile rendering.' });
  } else {
    f.push({ id: "viewport", area: "metadata", severity: "pass", title: "Viewport meta tag present" });
  }
  return f;
}

export function contentChecks(p: PageFacts): Finding[] {
  const f: Finding[] = [];
  if (p.h1Count === 0) {
    f.push({ id: "h1", area: "content", severity: "warning", title: "No <h1> heading", evidence: p.headings.length ? `Headings found: ${p.headings.slice(0, 5).map((h) => `h${h.level} “${h.text}”`).join(", ")}` : "No headings at all in the served HTML", fix: "Give the page one clear main heading." });
  } else if (p.h1Count > 1) {
    f.push({ id: "h1", area: "content", severity: "notice", title: `${p.h1Count} <h1> headings`, detail: p.headings.filter((h) => h.level === 1).map((h) => h.text).join(" | ") });
  } else {
    f.push({ id: "h1", area: "content", severity: "pass", title: "One <h1>", detail: p.headings.find((h) => h.level === 1)?.text });
  }
  let skipped = false;
  for (let i = 1; i < p.headings.length; i++) {
    if (p.headings[i].level - p.headings[i - 1].level > 1) skipped = true;
  }
  if (skipped) {
    f.push({ id: "heading-order", area: "content", severity: "notice", title: "Heading levels skip (e.g. h2 → h4)", evidence: p.headings.slice(0, 8).map((h) => `h${h.level}`).join(" → "), fix: "Nest headings in order for accessibility." });
  }
  if (p.images.missingAlt > 0) {
    f.push({
      id: "img-alt",
      area: "content",
      severity: p.images.missingAlt > 3 ? "warning" : "notice",
      title: `${p.images.missingAlt} of ${p.images.total} images have no alt attribute`,
      detail: p.images.examplesMissingAlt.join(", "),
      fix: 'Add descriptive alt text, or alt="" for purely decorative images.',
    });
  } else if (p.images.total > 0) {
    f.push({ id: "img-alt", area: "content", severity: "pass", title: `All ${p.images.total} images have alt attributes` });
  }
  if (p.wordCount < 150) {
    f.push({
      id: "thin-content",
      area: "content",
      severity: "notice",
      title: `About ${p.wordCount} words of text in the HTML`,
      evidence: `${p.wordCount} words of visible text in the served HTML (before any JavaScript runs)`,
      fix: "If the content is rendered by JavaScript, use server-side rendering or pre-rendering so crawlers see it; otherwise add substantive text.",
    });
  }
  return f;
}

export function socialTagChecks(p: PageFacts): Finding[] {
  const f: Finding[] = [];
  const missing = ["og:title", "og:description", "og:image", "og:url"].filter((k) => !p.og[k]);
  if (missing.length === 4) {
    f.push({ id: "og-tags", area: "social", severity: "warning", title: "No Open Graph tags", evidence: "None of og:title, og:description, og:image, og:url found", fix: "Add og:title, og:description, og:image and og:url so links render as rich cards." });
  } else if (missing.length) {
    f.push({ id: "og-tags", area: "social", severity: missing.includes("og:image") ? "warning" : "notice", title: `Missing ${missing.join(", ")}`, evidence: `Present: ${["og:title", "og:description", "og:image", "og:url"].filter((k) => p.og[k]).join(", ") || "none"}`, fix: `Add ${missing.join(", ")} to the <head>.` });
  } else {
    f.push({ id: "og-tags", area: "social", severity: "pass", title: "Core Open Graph tags present" });
  }
  if (p.og["og:image"] && !/^https?:\/\//.test(p.og["og:image"])) {
    f.push({ id: "og-image-absolute", area: "social", severity: "warning", title: "og:image is not an absolute URL", detail: p.og["og:image"], fix: "Most platforms require a full https:// URL." });
  }
  if (!p.twitter["twitter:card"]) {
    f.push({ id: "twitter-card", area: "social", severity: "notice", title: "No twitter:card tag", evidence: "No <meta name=\"twitter:card\"> tag", fix: 'Add <meta name="twitter:card" content="summary_large_image"> for large previews on X.' });
  }
  return f;
}

type Node = Record<string, unknown>;

/** Typed nodes from untrusted JSON-LD, walked iteratively with depth and node caps (no recursion to overflow). */
function flattenJsonLd(value: unknown, maxDepth = 12, maxNodes = 300): Node[] {
  const out: Node[] = [];
  const stack: [unknown, number][] = [[value, 0]];
  let visited = 0;
  while (stack.length && out.length < maxNodes && visited < 5000) {
    const [v, depth] = stack.pop()!;
    visited++;
    if (depth > maxDepth) continue;
    if (Array.isArray(v)) {
      for (let i = Math.min(v.length, 500) - 1; i >= 0; i--) stack.push([v[i], depth + 1]);
    } else if (v && typeof v === "object") {
      const node = v as Node;
      if (Object.hasOwn(node, "@type")) out.push(node);
      if (Object.hasOwn(node, "@graph") && Array.isArray(node["@graph"])) stack.push([node["@graph"], depth + 1]);
    }
  }
  return out;
}

/** Type names are page text: keep only plausible schema.org-style names. */
const TYPE_NAME = /^[A-Za-z][A-Za-z0-9:./_-]{0,79}$/;
const typesOf = (n: Node) => {
  const raw = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
  return raw.filter((t): t is string => typeof t === "string" && TYPE_NAME.test(t)).slice(0, 10);
};

/** Minimal property expectations for common types. Not a substitute for Google's Rich Results Test. */
const EXPECTED: Record<string, string[][]> = {
  Organization: [["name"], ["url"]],
  LocalBusiness: [["name"], ["address"]],
  Product: [["name"], ["offers", "review", "aggregateRating"]],
  Article: [["headline"], ["datePublished"]],
  BlogPosting: [["headline"], ["datePublished"]],
  NewsArticle: [["headline"], ["datePublished"]],
  BreadcrumbList: [["itemListElement"]],
  FAQPage: [["mainEntity"]],
  WebSite: [["name"], ["url"]],
  Event: [["name"], ["startDate"], ["location"]],
  SoftwareApplication: [["name"], ["offers", "aggregateRating", "review"]],
  Recipe: [["name"], ["image"]],
};

export function structuredDataChecks(blocks: JsonLdBlock[], hasMicrodata: boolean): { findings: Finding[]; types: string[] } {
  const f: Finding[] = [];
  const types: string[] = [];
  blocks.forEach((b, i) => {
    if (b.error) {
      f.push({ id: `jsonld-parse-${i}`, area: "structured-data", severity: "error", title: `JSON-LD block ${i + 1} is not valid JSON`, detail: b.error, fix: "Search engines ignore the whole block when it does not parse." });
    }
  });
  const nodes = blocks.flatMap((b) => (b.error ? [] : flattenJsonLd(b.parsed)));
  for (const node of nodes) {
    for (const t of typesOf(node)) {
      types.push(t);
      const expected = Object.hasOwn(EXPECTED, t) ? EXPECTED[t] : undefined;
      if (!expected) continue;
      const missing = expected.filter((alts) => !alts.some((k) => Object.hasOwn(node, k) && node[k] !== undefined && node[k] !== "")).map((alts) => alts.join(" or "));
      if (missing.length) {
        f.push({ id: `jsonld-${t}`, area: "structured-data", severity: "warning", title: `${t} is missing ${missing.join(", ")}`, fix: "Check the type's required properties in Google's structured data docs and validate with the Rich Results Test." });
      }
    }
    if (!Object.hasOwn(node, "@context") && !blocks.some((b) => b.parsed && typeof b.parsed === "object" && Object.hasOwn(b.parsed as Node, "@context"))) {
      f.push({ id: "jsonld-context", area: "structured-data", severity: "warning", title: "JSON-LD without @context", fix: 'Add "@context": "https://schema.org".' });
    }
  }
  if (!blocks.length && !hasMicrodata) {
    f.push({ id: "structured-data", area: "structured-data", severity: "notice", title: "No structured data found", evidence: "No JSON-LD blocks and no microdata in the served HTML", fix: "Consider JSON-LD for your organisation, products, articles or breadcrumbs where it matches visible content." });
  } else if (types.length) {
    f.push({ id: "structured-data", area: "structured-data", severity: "pass", title: `Structured data types: ${[...new Set(types)].join(", ")}` });
  } else if (hasMicrodata) {
    f.push({ id: "structured-data", area: "structured-data", severity: "pass", title: "Microdata present (not inspected in detail)" });
  }
  return { findings: dedupe(f), types: [...new Set(types)] };
}

export function hreflangChecks(p: PageFacts, finalUrl: string): Finding[] {
  if (!p.hreflang.length) return [];
  const f: Finding[] = [];
  const self = p.hreflang.some((h) => normaliseUrl(h.href) === normaliseUrl(finalUrl));
  if (!self) {
    f.push({ id: "hreflang-self", area: "international", severity: "warning", title: "hreflang set does not include this page", fix: "Each page in an hreflang set should list itself." });
  }
  if (!p.hreflang.some((h) => h.lang === "x-default")) {
    f.push({ id: "hreflang-default", area: "international", severity: "notice", title: "No x-default hreflang" });
  }
  const bad = p.hreflang.filter((h) => h.lang !== "x-default" && !/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/i.test(h.lang));
  if (bad.length) {
    f.push({ id: "hreflang-codes", area: "international", severity: "warning", title: `Invalid hreflang codes: ${bad.map((h) => h.lang).join(", ")}` });
  }
  if (!f.length) f.push({ id: "hreflang", area: "international", severity: "pass", title: `hreflang: ${p.hreflang.length} alternates` });
  return f;
}

export function securityChecks(r: ResponseMeta): Finding[] {
  const f: Finding[] = [];
  if (!r.finalUrl.startsWith("https://")) {
    f.push({ id: "https", area: "security", severity: "error", title: "Page is served over plain HTTP", fix: "Serve over HTTPS and redirect HTTP to it." });
    return f;
  }
  f.push({ id: "https", area: "security", severity: "pass", title: "Served over HTTPS" });
  const missing = [
    ["strict-transport-security", "HSTS"],
    ["x-content-type-options", "X-Content-Type-Options"],
    ["content-security-policy", "Content-Security-Policy"],
    ["referrer-policy", "Referrer-Policy"],
  ].filter(([h]) => !r.headers[h]);
  if (missing.length) {
    f.push({ id: "security-headers", area: "security", severity: "notice", title: `Missing headers: ${missing.map(([, n]) => n).join(", ")}`, detail: "Not a ranking factor; listed as hygiene." });
  }
  return f;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => (seen.has(f.id + f.title) ? false : (seen.add(f.id + f.title), true)));
}

// ------------------------------------------------------------ classification

const CHALLENGE_BODY = /<title>[^<]*(just a moment|attention required|access denied|security check|challenge|are you a robot|please verify)[^<]*<\/title>|cf-browser-verification|challenge-platform|_Incapsula_|px-captcha|captcha-delivery|datadome|perimeterx/i;

/** Decides whether the response is the real page before any page-level check runs. */
export function classify(r: ResponseMeta, bodySample: string, isHtml: boolean): { outcome: AuditOutcome; reason: string } {
  const mitigated = (r.headers["cf-mitigated"] ?? "").toLowerCase() === "challenge";
  const challenge = mitigated || CHALLENGE_BODY.test(bodySample);
  const server = r.headers["server"] ? ` (server: ${r.headers["server"]})` : "";
  if ([401, 403, 407, 429].includes(r.status) || (challenge && (r.status >= 400 || mitigated))) {
    return { outcome: "blocked", reason: `HTTP ${r.status}${challenge ? ", bot challenge page" : ""}${server}` };
  }
  if (r.status >= 400) return { outcome: "page_error", reason: `HTTP ${r.status}` };
  if (challenge && r.status < 300) return { outcome: "blocked", reason: `HTTP ${r.status} but the body is a bot challenge page${server}` };
  if (!isHtml) return { outcome: "not_html", reason: `Content-Type ${r.headers["content-type"] || "missing"}` };
  return { outcome: "completed", reason: `HTTP ${r.status}` };
}

/** Finding that explains why the real page couldn't be audited. */
export function blockedFinding(reason: string): Finding {
  return {
    id: "blocked",
    area: "fetch",
    severity: "notice",
    status: "not_checked",
    title: "The site blocked our request, so the real page could not be audited",
    evidence: reason,
    fix: "If this is your site, allow the ToolCargoAudit user agent in your firewall or bot protection, then re-run. Search engines' crawlers are often treated differently — confirm with the search engine's own URL inspection tool.",
  };
}

const PAGE_CHECK_GROUPS: [Finding["area"], string][] = [
  ["indexing", "Indexing directives and canonical"],
  ["metadata", "Title, description, language and viewport"],
  ["content", "Headings, images and text"],
  ["social", "Social preview tags"],
  ["structured-data", "Structured data"],
];

/** Page-level check groups marked "not checked", with the reason as evidence. */
export function notCheckedPageChecks(reason: string): Finding[] {
  return PAGE_CHECK_GROUPS.map(([area, title]) => ({ id: `page-content-${area}`, area, severity: "notice", status: "not_checked", title, evidence: reason }));
}
