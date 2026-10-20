import { afterEach, describe, expect, it, vi } from "vitest";
import { comparePythonPackages, pythonPackageDetails } from "@/lib/connectors/pypi-packages/lookup";
afterEach(() => vi.unstubAllGlobals());
const metadata = (name = "requests") => ({ info: {
  name, version: "2.32.5", summary: "HTTP library", license: "Apache-2.0", license_expression: "Apache-2.0", requires_python: ">=3.9",
  requires_dist: ["urllib3<3,>=1.21.1"], classifiers: ["Programming Language :: Python :: 3"],
  project_urls: { Source: "https://github.com/psf/requests", Bad: "https://user:secret@example.com", Script: "javascript:alert(1)" },
  maintainer_email: "exclude-email", author_email: "exclude-author", description: "exclude-readme", yanked: false,
}, urls: [{ filename: "requests-2.32.5-py3-none-any.whl", packagetype: "bdist_wheel", python_version: "py3", size: 64000,
  upload_time_iso_8601: "2025-08-18T20:46:00Z", yanked: false, downloads: -1, url: "https://files.pythonhosted.org/exclude-file" }],
  releases: { "1.0": "exclude-history" }, vulnerabilities: ["exclude-audit"],
});
const json = (data: unknown) => new Response(JSON.stringify(data));
const parse = (text: string) => JSON.parse(text.split("\n\nSource:")[0]);
describe("PyPI Package Intelligence", () => {
  it("projects latest-release metadata and excludes raw content, credentials and file downloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(metadata())); vi.stubGlobal("fetch", fetchMock);
    const output = await pythonPackageDetails("Requests"); const result = parse(output);
    expect(result.latestVersion).toBe("2.32.5"); expect(result.requiresPython).toBe(">=3.9");
    expect(result.licenseExpression).toBe("Apache-2.0"); expect(result.dependencies.values).toEqual(["urllib3<3,>=1.21.1"]);
    expect(result.projectLinks.values).toEqual([{ label: "Source", url: "https://github.com/psf/requests" }]);
    expect(result.files.values[0].sizeBytes).toBe(64000); expect(result.files.values[0].uploadedAt).toBe("2025-08-18T20:46:00Z");
    expect(output).not.toMatch(/exclude-|user:secret/); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).href).toBe("https://pypi.org/pypi/requests/json");
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error"); expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
  it("rejects invalid names and normalized duplicates before any network request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const name of ["https://evil.test", "../requests", "requests/", "a?x=y", "a%2fb", "requests==2", " requests", "", "a".repeat(215), "_leading", "trailing-"]) {
      await expect(pythonPackageDetails(name)).rejects.toThrow(/package name/);
    }
    await expect(comparePythonPackages(["Requests", "requests"])).rejects.toThrow(/unique/);
    await expect(comparePythonPackages(["scikit.._learn", "scikit-learn"])).rejects.toThrow(/unique/);
    await expect(comparePythonPackages(["requests"])).rejects.toThrow(/2 to 5/);
    await expect(comparePythonPackages(Array(6).fill("requests"))).rejects.toThrow(/2 to 5/);
    await expect(comparePythonPackages(["requests", "../bad"])).rejects.toThrow(/package name/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("compares distinct normalized names", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => json(metadata(url.pathname.split("/")[2]))));
    const result = parse(await comparePythonPackages(["Requests", "scikit_learn"]));
    expect(result.packages.map((p: { normalizedName: string }) => p.normalizedName)).toEqual(["requests", "scikit-learn"]);
  });
  it("bounds every projected collection and ignores malformed optional values", async () => {
    const data = metadata();
    const expanded = { ...data, info: { ...data.info, requires_dist: Array(75).fill("dep>=1"), classifiers: Array(45).fill("Python"),
      project_urls: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`link${i}`, `https://example.com/${i}`])) },
      urls: Array(35).fill({ size: -1, upload_time_iso_8601: "bad-date", yanked: "yes" }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(expanded)));
    const result = parse(await pythonPackageDetails("requests"));
    for (const [key, length, total] of [["dependencies", 60, 75], ["classifiers", 40, 45], ["projectLinks", 20, 25], ["files", 30, 35]] as const) {
      expect(result[key].values).toHaveLength(length); expect(result[key].total).toBe(total); expect(result[key].truncated).toBe(true);
    }
    expect(result.files.values[0]).toMatchObject({ sizeBytes: null, uploadedAt: null, yanked: null });
  });
  it("rejects mismatched core metadata and missing release file lists", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(metadata("other"))).mockResolvedValueOnce(json({ ...metadata(), urls: null }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(pythonPackageDetails("requests")).rejects.toThrow(/invalid package metadata/);
    await expect(pythonPackageDetails("requests")).rejects.toThrow(/invalid package metadata/);
  });
  it("reports invalid JSON, missing projects, rate limits, network errors and oversized payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("not-json"))
      .mockResolvedValueOnce(new Response("missing", { status: 404 })).mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockRejectedValueOnce(new Error("network private detail")).mockResolvedValueOnce(new Response("x".repeat(2_000_001)));
    vi.stubGlobal("fetch", fetchMock);
    for (const message of [/invalid JSON/, /HTTP 404/, /rate-limited/, /Could not reach/, /too much data/]) {
      await expect(pythonPackageDetails("requests")).rejects.toThrow(message);
    }
  });
});
