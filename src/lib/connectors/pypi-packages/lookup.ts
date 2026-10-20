import { UserFacingError } from "@/lib/mcp/metered";
import { createPublicJson } from "@/lib/connectors/public-http";

export const PYTHON_PACKAGE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const registry = createPublicJson({ name: "PyPI public registry", origin: "https://pypi.org", maxBytes: 2_000_000 });
export function normalizePythonPackage(raw: string): string {
  if (typeof raw !== "string" || raw.length > 214 || !PYTHON_PACKAGE_PATTERN.test(raw)) {
    throw new UserFacingError("Use a Python package name such as requests or scikit-learn, without a URL, path or version selector (maximum 214 characters).");
  }
  return raw.toLowerCase().replace(/[-_.]+/g, "-");
}
type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const string = (value: unknown, max = 500): string | null => typeof value === "string" ? value.slice(0, max) : null;
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
function publicLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const link = new URL(value);
    return ["https:", "http:"].includes(link.protocol) && !link.username && !link.password ? link.href : null;
  } catch { return null; }
}
function list(value: unknown, limit: number, max: number) {
  const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return { values: values.slice(0, limit).map(item => item.slice(0, max)), total: values.length, truncated: values.length > limit };
}
async function lookup(name: string) {
  const data = object(await registry(`/pypi/${encodeURIComponent(name)}/json`));
  const info = object(data.info);
  if (typeof info.name !== "string" || !PYTHON_PACKAGE_PATTERN.test(info.name) || normalizePythonPackage(info.name) !== name ||
      typeof info.version !== "string" || !info.version || info.version.length > 100 || !Array.isArray(data.urls)) {
    throw new UserFacingError("PyPI returned invalid package metadata.");
  }
  const links = Object.entries(object(info.project_urls)).map(([label, url]) => ({ label: label.slice(0, 100), url: publicLink(url) })).filter(link => link.url !== null);
  const files = data.urls.map(object);
  return {
    name: info.name, normalizedName: name, latestVersion: info.version,
    summary: string(info.summary, 1500), license: string(info.license, 2000), licenseExpression: string(info.license_expression),
    requiresPython: string(info.requires_python), dependencies: list(info.requires_dist, 60, 500), classifiers: list(info.classifiers, 40, 250),
    projectUrl: `https://pypi.org/project/${encodeURIComponent(name)}/`, homepage: publicLink(info.home_page),
    projectLinks: { values: links.slice(0, 20), total: links.length, truncated: links.length > 20 },
    yanked: typeof info.yanked === "boolean" ? info.yanked : null, yankedReason: string(info.yanked_reason, 1000),
    files: { values: files.slice(0, 30).map(file => ({
      filename: string(file.filename, 300), packageType: string(file.packagetype, 50), pythonVersion: string(file.python_version, 100),
      requiresPython: string(file.requires_python), sizeBytes: count(file.size),
      uploadedAt: typeof file.upload_time_iso_8601 === "string" && /^\d{4}-\d{2}-\d{2}T/.test(file.upload_time_iso_8601) && Number.isFinite(Date.parse(file.upload_time_iso_8601)) ? file.upload_time_iso_8601.slice(0, 50) : null,
      yanked: typeof file.yanked === "boolean" ? file.yanked : null, yankedReason: string(file.yanked_reason, 1000),
    })), total: files.length, truncated: files.length > 30 },
  };
}
const source = "Source: PyPI public project JSON API, latest release metadata. Metadata is publisher supplied and may differ from installed files. Dependency strings are not resolved or checked for compatibility. File lists are capped at 30; historical releases, README content, author/maintainer emails and distribution contents are excluded. No package is downloaded, installed or executed. This is not a security audit or download-statistics service. Projects exceeding the 2 MB upstream response limit are unavailable through this connector.";
export async function pythonPackageDetails(raw: string): Promise<string> {
  return `${JSON.stringify(await lookup(normalizePythonPackage(raw)), null, 2)}\n\n${source}`;
}
export async function comparePythonPackages(rawNames: string[]): Promise<string> {
  if (!Array.isArray(rawNames) || rawNames.length < 2 || rawNames.length > 5) throw new UserFacingError("Compare 2 to 5 Python packages.");
  const names = rawNames.map(normalizePythonPackage);
  if (new Set(names).size !== names.length) throw new UserFacingError("Package names must be unique after Python package-name normalization.");
  return `${JSON.stringify({ packages: await Promise.all(names.map(lookup)) }, null, 2)}\n\n${source}`;
}
