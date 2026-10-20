import { afterEach, describe, expect, it, vi } from "vitest";
import { publicationDetails, searchPublications } from "@/lib/connectors/crossref/lookup";

afterEach(() => vi.unstubAllGlobals());
const DOI = "10.1038/s41586-021-03819-2";
const work = (doi = DOI) => ({
  DOI: doi, title: ["Highly accurate protein structure prediction with AlphaFold"], author: [{ given: "John", family: "Jumper", email: "exclude-author-email" }],
  "container-title": ["Nature"], publisher: "Springer Science and Business Media LLC", type: "journal-article", published: { "date-parts": [[2021, 7, 15]] },
  license: [{ URL: "https://creativecommons.org/licenses/by/4.0/", "content-version": "vor" }], "reference-count": 62, "is-referenced-by-count": 100,
  abstract: "exclude-copyrighted-abstract", link: [{ URL: "https://publisher.example/fulltext", secret: "exclude-unreviewed-link" }],
});
const json = (message: unknown, type = "work") => new Response(JSON.stringify({ status: "ok", "message-type": type, message }));
const parse = (output: string) => JSON.parse(output.split("\n\nSource:")[0]);

describe("Crossref Research", () => {
  it("projects bibliographic fields without abstracts, full text or author emails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(work()));
    vi.stubGlobal("fetch", fetchMock);
    const output = await publicationDetails(DOI);
    const result = parse(output);
    expect(result.doi).toBe(DOI);
    expect(result.sourceUrl).toBe("https://doi.org/10.1038/s41586-021-03819-2");
    expect(result.authors.names).toEqual(["John Jumper"]);
    expect(result.publishedDateParts).toEqual([2021, 7, 15]);
    expect(result.licenses).toEqual([{ url: "https://creativecommons.org/licenses/by/4.0/", appliesTo: "vor" }]);
    expect(result.crossrefCitedByCount).toBe(100);
    expect(output).not.toMatch(/exclude-|fulltext/);
    expect(new URL(fetchMock.mock.calls[0][0]).href).toBe("https://api.crossref.org/works/10.1038%2Fs41586-021-03819-2");
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("searches with bounded rows and inclusive publication filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ items: [{ ...work(), "reference-count": undefined, "references-count": 35 }, work("10.1000/second")], "total-results": 50 }, "work-list"));
    vi.stubGlobal("fetch", fetchMock);
    const result = parse(await searchPublications({ query: " protein prediction ", limit: 1, fromYear: 2021, toYear: 2023 }));
    expect(result.returned).toBe(1);
    expect(result.limitedToFirstResults).toBe(true);
    expect(result.totalResults).toBe(50);
    expect(result.publications[0].referenceCount).toBe(35);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://api.crossref.org");
    expect(url.pathname).toBe("/works");
    expect(url.searchParams.get("query")).toBe("protein prediction");
    expect(url.searchParams.get("rows")).toBe("1");
    expect(url.searchParams.get("filter")).toBe("from-pub-date:2021-01-01,until-pub-date:2023-12-31");
    expect(url.searchParams.get("select")).not.toContain("abstract");
    expect(url.searchParams.get("select")).toContain("references-count");
    expect(url.searchParams.has("mailto")).toBe(false);
  });

  it("encodes DOI punctuation into one path and never follows returned links", async () => {
    const unusual = "10.1000/a?b#c/../suffix";
    const fetchMock = vi.fn().mockResolvedValue(json(work(unusual)));
    vi.stubGlobal("fetch", fetchMock);
    await publicationDetails(unusual);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe(`/works/${encodeURIComponent(unusual)}`);
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects URLs, invalid DOI prefixes and oversized inputs before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const invalid of ["https://doi.org/" + DOI, "../works", "10.123/short", "10.1234567890/long", "10.1000/", "10.1000/a b", "10.1000/a\n", "10.1000/" + "a".repeat(241)]) {
      await expect(publicationDetails(invalid)).rejects.toThrow(/plain DOI/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates query, limit and year bounds before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const query of ["", " a ", "x".repeat(301), "query\ntext"]) await expect(searchPublications({ query })).rejects.toThrow(/2–300/);
    for (const limit of [0, 11, 2.5, NaN]) await expect(searchPublications({ query: "paper", limit })).rejects.toThrow(/1 to 10/);
    for (const fromYear of [999, 2101, 2020.5, NaN]) await expect(searchPublications({ query: "paper", fromYear })).rejects.toThrow(/1000 to 2100/);
    await expect(searchPublications({ query: "paper", fromYear: 2023, toYear: 2021 })).rejects.toThrow(/at or before/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("identifies missing fields and safely bounds author and license output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ DOI, author: Array.from({ length: 30 }, (_, i) => ({ name: `Author ${i}`, email: "secret-email" })),
      license: Array.from({ length: 12 }, (_, i) => ({ URL: i === 0 ? "javascript:alert(1)" : i === 1 ? "https://user:secret@publisher.example" : `https://publisher.example/license/${i}` })),
      "reference-count": -5, "is-referenced-by-count": "not-a-number", published: { "date-parts": [[2021, 13, 50]] } })));
    const result = parse(await publicationDetails(DOI));
    expect(result.authors.names).toHaveLength(20);
    expect(result.authors.total).toBe(30);
    expect(result.authors.truncated).toBe(true);
    expect(result.licenses).toHaveLength(8);
    expect(result.licensesTruncated).toBe(true);
    expect(result.referenceCount).toBeNull();
    expect(result.crossrefCitedByCount).toBeNull();
    expect(result.missingMetadata).toEqual(["title", "journal", "publisher", "publication date"]);
  });

  it("accepts case-insensitive DOI matches and partial issued dates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...work("10.1000/ABc"), published: undefined, issued: { "date-parts": [[2022]] } })));
    expect(parse(await publicationDetails("10.1000/abc")).publishedDateParts).toEqual([2022]);
  });

  it("returns an explicit empty search and uses a default five-result bound", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ items: [], "total-results": 0 }, "work-list"));
    vi.stubGlobal("fetch", fetchMock);
    expect(parse(await searchPublications({ query: "unfindable paper" }))).toMatchObject({ returned: 0, publications: [], totalResults: 0, limitedToFirstResults: false });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("rows")).toBe("5");
  });

  it("rejects mismatched DOI records and malformed metadata envelopes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(work("10.1000/different"))).mockResolvedValueOnce(json({ title: ["No DOI"] })).mockResolvedValueOnce(json([], "work")).mockResolvedValueOnce(json({ items: {} }, "work-list"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(publicationDetails(DOI)).rejects.toThrow(/different DOI/);
    await expect(publicationDetails(DOI)).rejects.toThrow(/invalid publication metadata/);
    await expect(publicationDetails(DOI)).rejects.toThrow(/invalid metadata/);
    await expect(searchPublications({ query: "paper" })).rejects.toThrow(/invalid publication list/);
  });

  it("gives actionable failures for invalid JSON, rate limits and network errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("not json")).mockResolvedValueOnce(new Response("busy", { status: 429 })).mockResolvedValueOnce(new Response("missing", { status: 404 })).mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(publicationDetails(DOI)).rejects.toThrow(/invalid JSON/);
    await expect(publicationDetails(DOI)).rejects.toThrow(/rate-limited/);
    await expect(publicationDetails(DOI)).rejects.toThrow(/HTTP 404/);
    await expect(publicationDetails(DOI)).rejects.toThrow(/Could not reach Crossref/);
  });
});
