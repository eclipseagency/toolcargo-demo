import type { Connector, ConnectorTool } from "@/lib/catalog/connectors";
export const PYPI_PACKAGES_TOOLS: ConnectorTool[] = [
  { name: "python_package_details", title: "Inspect a Python package", description: "Read the latest PyPI version, license, Python requirements, bounded dependency strings, classifiers and release file metadata for one public Python package. Does not install code or assess security.", readOnly: true },
  { name: "compare_python_packages", title: "Compare Python packages", description: "Compare 2 to 5 distinct public PyPI packages using latest-version metadata, Python requirements, license and dependency strings. Names are normalized; no dependency resolution or installation.", readOnly: true },
];
export const PYPI_PACKAGES_CONNECTOR: Connector = {
  slug: "pypi-packages", name: "PyPI Package Intelligence", icon: "PY", category: "developer", status: "available", runs: "hosted",
  tagline: "Compare Python packages before choosing a dependency.",
  description: "Read public PyPI metadata for a package or compare a shortlist. See the latest version, license, Python requirements, declared dependencies and release file information without installing code.",
  buyer: "Python developers and teams selecting dependencies.",
  outcomes: ["Check a package's declared Python requirements and license.", "Compare dependency lists for up to five packages.", "Inspect latest-release file types and yanked status with source links."],
  useCases: [{ title: "Choose an HTTP client", prompt: "Compare requests and httpx on PyPI. Show Python requirements, licenses and declared dependencies.", result: "Source-linked latest-release metadata for both packages; compatibility remains a developer decision." }],
  tools: PYPI_PACKAGES_TOOLS, includedWith: "site-audit", pricing: "Included with Site Audit; each successful tool call uses one call from your shared plan quota.",
  requirements: ["ToolCargo account with Site Audit activated.", "ToolCargo OAuth or an API key scoped to connector:pypi-packages.", "No external API key is required."],
  limitations: ["Public PyPI projects only; latest-release metadata is publisher supplied.", "Dependency requirements are strings, not a resolved environment or compatibility guarantee.", "Dependency lists are capped at 60, classifiers at 40, project links at 20 and files at 30.", "Responses exceeding 2 MB cannot be inspected. Historical releases, README content and maintainer emails are excluded.", "No package downloads, installs, execution, vulnerability audit or download statistics."],
};
