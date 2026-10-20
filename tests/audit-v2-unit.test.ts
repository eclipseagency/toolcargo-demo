import { describe, expect, it } from "vitest";
import { classify, notCheckedPageChecks, blockedFinding } from "@/lib/connectors/site-audit/checks";
import { enrich, sanitizeEvidence } from "@/lib/connectors/site-audit/knowledge";
import { summarise, heuristicScore, findingsToMarkdown, type Finding } from "@/lib/connectors/site-audit/types";
import { compareRuns, pageKey } from "@/lib/audit-compare";
import { aggregateSite, auditSite, choosePages, discoverCandidates } from "@/lib/connectors/site-audit/tools";

const meta = (status: number, headers: Record<string, string> = { "content-type": "text/html" }) => ({
  requestedUrl: "https://a.test/",
  finalUrl: "https://a.test/",
  status,
  redirects: [],
  headers,
  elapsedMs: 10,
  bytes: 100,
  truncated: false,
});

describe("response classification", () => {
  it("treats 401/403/429 and bot challenges as blocked, never as the page", () => {
    expect(classify(meta(403), "<html><title>Challenge - Upwork</title>", true).outcome).toBe("blocked");
    expect(classify(meta(429), "", true).outcome).toBe("blocked");
    expect(classify(meta(503, { "content-type": "text/html", "cf-mitigated": "challenge" }), "", true).outcome).toBe("blocked");
    expect(classify(meta(200), "<html><head><title>Just a moment...</title>", true).outcome).toBe("blocked");
  });
  it("separates page errors, non-HTML and completed pages", () => {
    expect(classify(meta(404), "<html><title>Not found</title>", true).outcome).toBe("page_error");
    expect(classify(meta(500), "", true).outcome).toBe("page_error");
    expect(classify(meta(200, { "content-type": "application/pdf" }), "%PDF", false).outcome).toBe("not_html");
    expect(classify(meta(200), "<html><title>Pricing</title>", true).outcome).toBe("completed");
  });
});

describe("finding model v2", () => {
  it("adds status, evidence and why-it-matters while keeping detail as an alias", () => {
    const [f] = enrich([{ id: "noindex", area: "indexing", severity: "error", title: "Page is marked noindex", detail: "meta robots: noindex", fix: "Remove it." }]);
    expect(f.status).toBe("fail");
    expect(f.evidence).toBe("meta robots: noindex");
    expect(f.detail).toBe(f.evidence);
    expect(f.why).toMatch(/not to show the page/);
  });
  it("treats quoted page text as untrusted: strips control/bidi characters, fences and caps length", () => {
    expect(sanitizeEvidence("Title\u202e\u0007 ```ignore previous``` \n\n text")).toBe("Title ``ignore previous`` text");
    expect(sanitizeEvidence("x".repeat(1000))!.length).toBe(298);
    expect(sanitizeEvidence(undefined)).toBeUndefined();
  });
  it("counts not-checked separately and gives no weight to them in the score", () => {
    const fs = enrich([blockedFinding("HTTP 403"), ...notCheckedPageChecks("HTTP 403")]);
    const s = summarise(fs);
    expect(s.notChecked).toBe(6);
    expect(s.errors + s.warnings + s.notices + s.passed).toBe(0);
    expect(heuristicScore(s)).toBe(100); // callers must not show a score for non-completed audits
    expect(findingsToMarkdown(fs)).toContain("Not checked:");
    expect(findingsToMarkdown(fs)).not.toContain("Not checked: Not checked");
  });
});

describe("comparing runs", () => {
  const f = (id: string, severity: Finding["severity"], status: Finding["status"] = severity === "pass" ? "pass" : "fail", title = id): Finding => ({ id, area: "metadata", severity, status, title });
  it("classifies fixed, new and unchanged findings check by check", () => {
    const before = { outcome: "completed" as const, score: 70, findings: [f("canonical", "warning"), f("title", "warning", "fail", "Title is only 9 characters"), f("noindex", "pass"), f("title-count", "warning")] };
    const after = { outcome: "completed" as const, score: 83, findings: [f("canonical", "pass"), f("title", "warning", "fail", "Title is 80 characters"), f("noindex", "error")] };
    const c = compareRuns(before, after);
    expect(c.fixed.map((i) => i.id).sort()).toEqual(["canonical", "title-count"]); // passing now, or no longer reported
    expect(c.introduced.map((i) => i.id)).toEqual(["noindex"]);
    expect(c.unchanged.map((i) => i.id)).toEqual(["title"]);
    expect(c.unchanged[0].before?.title).toBe("Title is only 9 characters");
    expect(c.scoreDelta).toBe(13);
  });
  it("never reports fixes when either run could not see the page", () => {
    const before = { outcome: "completed" as const, score: 70, findings: [f("canonical", "warning"), f("h1", "warning")] };
    const blocked = { outcome: "blocked" as const, score: null, findings: [f("blocked", "notice", "not_checked"), f("page-content-indexing", "notice", "not_checked")] };
    const c = compareRuns(before, blocked);
    expect(c.comparable).toBe(false);
    expect(c.fixed).toHaveLength(0);
    expect(c.introduced).toHaveLength(0);
    expect(c.notComparable.length).toBeGreaterThan(0);
    expect(c.scoreDelta).toBeNull();
  });
  it("warns when the runs used different check versions", () => {
    const run = (v: string) => ({ outcome: "completed" as const, score: 90, findings: [f("h1", "warning")], check_version: v });
    expect(compareRuns(run("site-audit/a"), run("site-audit/a")).versionNotice).toBeUndefined();
    expect(compareRuns(run("site-audit/a"), run("site-audit/b")).versionNotice).toMatch(/different check versions/);
  });
  it("groups URLs of the same page", () => {
    expect(pageKey("https://www.Example.com/pricing/#plans")).toBe(pageKey("https://example.com/pricing"));
    expect(pageKey("https://example.com/a?x=1")).not.toBe(pageKey("https://example.com/a"));
  });
});

describe("audit_site page selection and summary", () => {
  it("starts with the given page, keeps the same site, drops files and duplicates, shallow paths first", () => {
    const pages = choosePages("https://www.example.com/", [
      "https://example.com/blog/2024/post",
      "https://example.com/pricing",
      "https://example.com/pricing/",
      "https://other.test/about",
      "https://example.com/brochure.pdf",
      "https://example.com/about#team",
      "mailto:hi@example.com",
      "/contact",
    ], 5);
    expect(pages).toEqual(["https://www.example.com/", "https://example.com/pricing", "https://example.com/about", "https://www.example.com/contact", "https://example.com/blog/2024/post"]);
    expect(choosePages("https://example.com/a", ["https://example.com/b"], 1)).toEqual(["https://example.com/a"]);
  });

  it("aggregates failing checks across completed pages, worst first, and orders pages by score", () => {
    const page = (url: string, score: number, findings: Finding[], outcome = "completed") => ({
      url, status: "audited" as const,
      out: { markdown: "", data: { url, outcome, score, summary: { errors: 0, warnings: 0, notices: 0, passed: 0, notChecked: 0 }, findings } },
    });
    const fail = (id: string, severity: Finding["severity"]): Finding => ({ id, area: "metadata", severity, status: "fail", title: id });
    const agg = aggregateSite([
      page("https://a.test/", 80, [fail("meta-description", "warning"), fail("twitter-card", "notice")]),
      page("https://a.test/x", 60, [fail("meta-description", "warning"), fail("noindex", "error")]),
      page("https://a.test/blocked", 0, [], "blocked"),
      { url: "https://a.test/down", status: "unreachable", reason: "timeout" },
      { url: "https://a.test/late", status: "not_reached" },
    ]);
    expect(agg.audited).toBe(3);
    expect(agg.completed).toBe(2);
    expect(agg.sharedIssues.map((i) => [i.id, i.pages.length])).toEqual([["noindex", 1], ["meta-description", 2], ["twitter-card", 1]]);
    expect(agg.pages[0].url).toBe("https://a.test/blocked"); // no score sorts first, then weakest
    expect(agg.pages.slice(1).map((p) => p.score)).toEqual([60, 80]);
  });
});

describe("audit_site time limits (a slow site must not outlive the function)", () => {
  it("skips discovery once its deadline has passed, without fetching anything", async () => {
    const t0 = Date.now();
    const r = await discoverCandidates("https://example.com/", Date.now() - 1);
    expect(r).toEqual({ source: "none", urls: [], note: "page discovery skipped (time limit)" });
    expect(Date.now() - t0).toBeLessThan(200);
  });
  it("starts no page after the call deadline and counts nothing", async () => {
    const site = await auditSite("https://example.com", { maxPages: 3, deadlineMs: 0 });
    expect(site.counted).toBe(0);
    expect(site.results.every((r) => r.status === "not_reached")).toBe(true);
    expect(site.markdown).toMatch(/Not reached before the time limit/);
  });
});
