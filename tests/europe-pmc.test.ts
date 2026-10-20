import { afterEach, describe, expect, it, vi } from "vitest";
import { publicationDetails, searchPublications, type EuropePmcSource } from "@/lib/connectors/europe-pmc/lookup";
afterEach(() => vi.unstubAllGlobals());
const record = (id = "39795305", source = "MED") => ({ id, source, pmid: id, pmcid: "PMC11722980", doi: "10.3390/plants14010045", title: "Gene editing", authorString: "Xing JX, Luo AJ, Wang XH.", journalTitle: "Plants", pubYear: "2024", pubType: "research-article; journal article", firstPublicationDate: "2024-12-26", firstIndexDate: "2025-01-13", isOpenAccess: "Y", citedByCount: 3, abstractText: "exclude-abstract", fullTextUrlList: { fullTextUrl: [{ url: "exclude-download" }] }, authorList: { author: [{ email: "exclude-email", affiliation: "exclude-affiliation" }] } });
const parse = (s: string) => JSON.parse(s.split("\n\nSource:")[0]);
function mockResults(items: unknown[], hitCount = items.length, nextCursorMark?: string) {
  const f = vi.fn().mockImplementation((url: URL) => {
    const p = new URL(url).searchParams;
    return Promise.resolve(new Response(JSON.stringify({ hitCount, ...(nextCursorMark !== undefined ? { nextCursorMark } : {}), request: { queryString: p.get("query"), pageSize: Number(p.get("pageSize")), cursorMark: p.get("cursorMark") }, resultList: { result: items } })));
  }); vi.stubGlobal("fetch", f); return f;
}
describe("Europe PMC Research", () => {
  it("uses fixed lite endpoint without credentials, abstracts, full text or following links", async () => {
    const f = mockResults([record()]); const output = await publicationDetails({ source: "MED", id: "39795305" });
    expect(parse(output)).toMatchObject({ source: "MED", id: "39795305", sourceUrl: "https://europepmc.org/article/MED/39795305", doi: "10.3390/plants14010045", isOpenAccess: true, license: null, firstPublicationDate: "2024-12-26" });
    expect(parse(output).authors.names).toEqual(["Xing JX", "Luo AJ", "Wang XH."]); expect(output).not.toMatch(/exclude-/);
    const [url, opts] = f.mock.calls[0]; const u = new URL(url);
    expect(u.origin).toBe("https://www.ebi.ac.uk"); expect(u.pathname).toBe("/europepmc/webservices/rest/search");
    expect(u.searchParams.get("resultType")).toBe("lite"); expect(u.searchParams.get("query")).toBe('EXT_ID:39795305 AND SRC:MED');
    expect(opts.redirect).toBe("error"); expect(opts.cache).toBe("no-store"); expect(Object.keys(opts.headers).sort()).toEqual(["accept", "user-agent"]); expect(f).toHaveBeenCalledTimes(1);
  });
  it("quotes phrase operators and applies first-publication year filters with explicit cursor paging", async () => {
    const f = mockResults([record()], 50, "AoIIP737OCg="); const r = parse(await searchPublications({ query: ' gene" OR SRC:PPR \\ ', fromYear: 2020, toYear: 2024, limit: 2, cursorMark: "AAAA==" }));
    const p = new URL(f.mock.calls[0][0]).searchParams;
    expect(p.get("query")).toBe('"gene\\" OR SRC:PPR \\\\" AND FIRST_PDATE:[2020-01-01 TO 2024-12-31]');
    expect(p.get("cursorMark")).toBe("AAAA=="); expect(p.get("pageSize")).toBe("2"); expect(p.get("synonym")).toBe("false");
    expect(r).toMatchObject({ totalResults: 50, returned: 1, nextCursorMark: "AoIIP737OCg=" }); expect(f).toHaveBeenCalledTimes(1);
  });
  it("stops at absent or repeated cursors, handles empty results and single-sided years", async () => {
    const f = mockResults([], 0, "AAAA"); expect(parse(await searchPublications({ query: "nothing", fromYear: 2020 }))).toMatchObject({ returned: 0, nextCursorMark: null });
    expect(new URL(f.mock.calls[0][0]).searchParams.get("query")).toContain("FIRST_PDATE:[2020-01-01 TO 2100-12-31]");
    mockResults([record()], 1, "*"); expect(parse(await searchPublications({ query: "gene editing", toYear: 2024 }))).toMatchObject({ limit: 5, cursorMark: "*", nextCursorMark: null });
  });
  it("preserves indexed preprint, withdrawal, retraction and correction cautions", async () => {
    const r = record("PPR123", "PPR"); r.pubType = "preprint; preprint-withdrawal; Retracted Publication; published erratum";
    mockResults([r]); const p = parse(await publicationDetails({ source: "PPR", id: "PPR123" }));
    expect(p.publicationTypes.items).toHaveLength(4); expect(p.cautions).toHaveLength(3); expect(p.cautions.join(" ")).toMatch(/Retraction/);
  });
  it("bounds text and lists while detecting warnings beyond projection limit", async () => {
    const r = record(); Object.assign(r, { title: "T".repeat(2100), authorString: Array.from({ length: 25 }, () => "N".repeat(600)).join(", "), pubType: Array.from({ length: 25 }, () => "type").concat("Retracted Publication").join("; ") });
    mockResults([r]); const p = parse(await publicationDetails({ source: "MED", id: r.id }));
    expect(p.title).toHaveLength(2000); expect(p.authors.names).toHaveLength(20); expect(p.authors.names[0]).toHaveLength(500); expect(p.authors).toMatchObject({ total: 25, truncated: true }); expect(p.publicationTypes).toMatchObject({ total: 26, truncated: true }); expect(p.cautions.join(" ")).toMatch(/Retraction/); expect(p.textTruncated).toContain("title");
  });
  it("reports unknown OA, missing fields, unsafe DOI and invalid dates without inventing metadata", async () => {
    mockResults([{ id: "123", source: "MED", isOpenAccess: "unknown", doi: "https://bad/", firstPublicationDate: "2024-02-30" }]);
    expect(parse(await publicationDetails({ source: "MED", id: "123" }))).toMatchObject({ title: null, doi: null, isOpenAccess: null, firstPublicationDate: null, license: null, missingMetadata: ["title", "journal", "author names", "first publication date", "publication types"] });
  });
  it("rejects input syntax, identity, cursor and bounds before fetching", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    for (const query of ["", " x ", "x".repeat(301), "gene\nediting"]) await expect(searchPublications({ query })).rejects.toThrow(/2–300/);
    for (const limit of [0, 11, NaN, 1.5]) await expect(searchPublications({ query: "gene", limit })).rejects.toThrow(/1 to 10/);
    for (const cursorMark of ["https://evil", "a b", "x".repeat(2001), ""]) await expect(searchPublications({ query: "gene", cursorMark })).rejects.toThrow(/nextCursorMark/);
    for (const fromYear of [999, 2101, 1.5, NaN]) await expect(searchPublications({ query: "gene", fromYear })).rejects.toThrow(/1000 to 2100/);
    await expect(searchPublications({ query: "gene", fromYear: 2024, toYear: 2020 })).rejects.toThrow(/at or before/);
    for (const id of ["", "https://evil", "123 OR x", "x".repeat(101)]) await expect(publicationDetails({ source: "MED", id })).rejects.toThrow(/plain Europe PMC/);
    await expect(publicationDetails({ source: "med" as EuropePmcSource, id: "123" })).rejects.toThrow(/uppercase/); expect(f).not.toHaveBeenCalled();
  });
  it("rejects exact lookup ambiguity, no match and different source or ID", async () => {
    mockResults([], 0); await expect(publicationDetails({ source: "MED", id: "123" })).rejects.toThrow(/No Europe PMC/);
    mockResults([record()], 2); await expect(publicationDetails({ source: "MED", id: "123" })).rejects.toThrow(/ambiguous/);
    mockResults([record()]); await expect(publicationDetails({ source: "MED", id: "123" })).rejects.toThrow(/different publication/);
    mockResults([record("123", "PPR")]); await expect(publicationDetails({ source: "MED", id: "123" })).rejects.toThrow(/different publication/);
  });
  it("rejects malformed provider envelopes, pagination and source records", async () => {
    for (const data of [{ errCode: 404 }, { hitCount: "1", resultList: { result: [] } }, { hitCount: 1, resultList: { result: {} } }, { hitCount: 1, request: {}, resultList: { result: [record()] } }]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))); await expect(searchPublications({ query: "gene" })).rejects.toThrow(/invalid publication metadata/);
    }
    mockResults([record()], 1, "https://evil"); await expect(searchPublications({ query: "gene" })).rejects.toThrow(/invalid publication metadata/);
    mockResults([record("123", "evil")]); await expect(searchPublications({ query: "gene" })).rejects.toThrow(/uppercase/);
    mockResults([record(), record()], 2); await expect(searchPublications({ query: "gene", limit: 1 })).rejects.toThrow(/invalid publication metadata/);
  });
  it("uses first-publication date rather than issue year and rejects missing or out-of-range filtered metadata", async () => {
    const r = record(); r.pubYear = "2025"; mockResults([r]); expect(parse(await searchPublications({ query: "gene", toYear: 2024 })).returned).toBe(1);
    mockResults([r]); await expect(searchPublications({ query: "gene", fromYear: 2025 })).rejects.toThrow(/outside the requested/);
    Object.assign(r, { firstPublicationDate: undefined }); mockResults([r]); await expect(searchPublications({ query: "gene", toYear: 2024 })).rejects.toThrow(/missing that date/);
  });
  it("reports rate limits, network and JSON errors without upstream bodies", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("exclude-secret", { status: 429 })).mockResolvedValueOnce(new Response("exclude-secret", { status: 404 })).mockResolvedValueOnce(new Response("broken")).mockRejectedValueOnce(new Error("exclude-network")); vi.stubGlobal("fetch", f);
    await expect(searchPublications({ query: "gene" })).rejects.toThrow(/rate-limited/); await expect(searchPublications({ query: "gene" })).rejects.toThrow(/HTTP 404/); await expect(searchPublications({ query: "gene" })).rejects.toThrow(/invalid JSON/); await expect(searchPublications({ query: "gene" })).rejects.toThrow(/Could not reach Europe PMC/);
  });
});
