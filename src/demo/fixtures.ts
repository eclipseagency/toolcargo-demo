/**
 * Synthetic fixtures for the offline demo. Every record, name and identifier here
 * is invented for illustration (DOIs use Crossref's 10.5555 test prefix); none of
 * it is real publication, package or customer data.
 */
export const DEMO_DOI = "10.5555/demo.2024.001";

export function crossrefWork(doi = DEMO_DOI, title = "A Synthetic Study of Connector Reliability") {
  return {
    DOI: doi, title: [title], author: [{ given: "Ada", family: "Example" }, { given: "Lin", family: "Sample" }],
    "container-title": ["Journal of Demonstration Data"], publisher: "Example Press", type: "journal-article",
    published: { "date-parts": [[2024, 3, 14]] }, license: [{ URL: "https://creativecommons.org/licenses/by/4.0/", "content-version": "vor" }],
    "reference-count": 24, "is-referenced-by-count": 7,
  };
}

export function europePmcRecord(id = "90000001", source = "MED") {
  return {
    id, source, pmid: id, doi: "10.5555/demo.2023.042", title: "Offline fixtures for reproducible API demos",
    authorString: "Example A, Sample L.", journalTitle: "Demo Methods", pubYear: "2023", pubType: "research-article; journal article",
    firstPublicationDate: "2023-09-01", firstIndexDate: "2023-09-10", isOpenAccess: "Y", citedByCount: 2,
  };
}

export function pypiProject(name: string) {
  return {
    info: {
      name, version: "1.4.0", summary: `Synthetic demo metadata for ${name}`, license: "MIT", license_expression: "MIT", requires_python: ">=3.9",
      requires_dist: ["example-dependency>=1.0"], classifiers: ["Programming Language :: Python :: 3"],
      project_urls: { Source: `https://example.com/${name}` }, yanked: false,
    },
    urls: [{ filename: `${name.replace(/-/g, "_")}-1.4.0-py3-none-any.whl`, packagetype: "bdist_wheel", python_version: "py3", size: 48000, upload_time_iso_8601: "2024-05-01T12:00:00Z", yanked: false }],
  };
}

export const DEMO_PAGE_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><title>Example Widgets</title>
<link rel="canonical" href="https://example.com/">
<meta property="og:title" content="Example Widgets">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example Widgets","url":"https://example.com/"}</script>
</head><body>
<h1>Example Widgets</h1><h1>Second heading</h1>
<img src="/hero.png"><a href="/pricing">Pricing</a> <a href="/missing">Old page</a>
</body></html>`;

export const DEMO_ROBOTS = "User-agent: *\nDisallow: /private/\nSitemap: https://example.com/sitemap.xml\n";
export const DEMO_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url><url><loc>https://example.com/pricing</loc></url></urlset>`;
