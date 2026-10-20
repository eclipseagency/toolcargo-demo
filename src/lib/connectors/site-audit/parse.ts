import * as cheerio from "cheerio";

export type JsonLdBlock = { raw: string; parsed: unknown; error?: string };

export type PageFacts = {
  url: string;
  lang: string | null;
  title: string | null;
  titleCount: number;
  metaDescription: string | null;
  metaDescriptionCount: number;
  canonicals: string[];
  robotsMeta: string[];
  viewport: string | null;
  charset: string | null;
  headings: { level: number; text: string }[];
  h1Count: number;
  images: { total: number; missingAlt: number; examplesMissingAlt: string[] };
  links: { href: string; text: string; rel: string }[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  jsonLd: JsonLdBlock[];
  hreflang: { lang: string; href: string }[];
  wordCount: number;
  hasMicrodata: boolean;
};

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** Extracts SEO-relevant facts from an HTML document. Relative URLs are resolved against `url`. */
export function parsePage(html: string, url: string): PageFacts {
  const $ = cheerio.load(html);
  const abs = (href: string | undefined) => {
    if (!href) return "";
    try {
      return new URL(href.trim(), url).toString();
    } catch {
      return href.trim();
    }
  };

  const metaByName = (name: string) =>
    $(`meta[name="${name}" i]`)
      .map((_, el) => clean($(el).attr("content")))
      .get();

  const og: Record<string, string> = {};
  $('meta[property^="og:" i]').each((_, el) => {
    const key = ($(el).attr("property") ?? "").toLowerCase();
    if (key && !(key in og)) og[key] = clean($(el).attr("content"));
  });
  const twitter: Record<string, string> = {};
  $('meta[name^="twitter:" i], meta[property^="twitter:" i]').each((_, el) => {
    const key = ($(el).attr("name") ?? $(el).attr("property") ?? "").toLowerCase();
    if (key && !(key in twitter)) twitter[key] = clean($(el).attr("content"));
  });

  const jsonLd: JsonLdBlock[] = $('script[type="application/ld+json" i]')
    .map((_, el) => {
      const raw = $(el).text().trim();
      try {
        return { raw, parsed: JSON.parse(raw) };
      } catch (err) {
        return { raw, parsed: null, error: (err as Error).message };
      }
    })
    .get();

  const images = $("img");
  const missingAlt = images.filter((_, el) => $(el).attr("alt") === undefined);

  const headings = $("h1, h2, h3, h4, h5, h6")
    .map((_, el) => ({ level: Number(el.tagName.slice(1)), text: clean($(el).text()).slice(0, 120) }))
    .get();

  const titleEls = $("head title, title");

  // Visible-ish text: drop scripts, styles and templates before counting words.
  const body = $("body").clone();
  body.find("script, style, noscript, template, svg").remove();
  const text = clean(body.text());

  return {
    url,
    lang: $("html").attr("lang")?.trim() || null,
    title: titleEls.length ? clean(titleEls.first().text()) : null,
    titleCount: $("title").length,
    metaDescription: metaByName("description")[0] ?? null,
    metaDescriptionCount: metaByName("description").length,
    canonicals: $('link[rel~="canonical" i]')
      .map((_, el) => abs($(el).attr("href")))
      .get(),
    robotsMeta: [...metaByName("robots"), ...metaByName("googlebot")].map((s) => s.toLowerCase()),
    viewport: metaByName("viewport")[0] ?? null,
    charset: $("meta[charset]").attr("charset") ?? null,
    headings,
    h1Count: headings.filter((h) => h.level === 1).length,
    images: {
      total: images.length,
      missingAlt: missingAlt.length,
      examplesMissingAlt: missingAlt
        .slice(0, 5)
        .map((_, el) => abs($(el).attr("src")))
        .get(),
    },
    links: $("a[href]")
      .map((_, el) => ({ href: abs($(el).attr("href")), text: clean($(el).text()).slice(0, 80), rel: ($(el).attr("rel") ?? "").toLowerCase() }))
      .get(),
    og,
    twitter,
    jsonLd,
    hreflang: $('link[rel~="alternate" i][hreflang]')
      .map((_, el) => ({ lang: ($(el).attr("hreflang") ?? "").toLowerCase(), href: abs($(el).attr("href")) }))
      .get(),
    wordCount: text ? text.split(" ").length : 0,
    hasMicrodata: $("[itemscope]").length > 0,
  };
}
