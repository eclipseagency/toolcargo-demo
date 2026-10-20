import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { billableTool, toolMeta } from "@/lib/mcp/hosted";
import { PYPI_PACKAGES_TOOLS } from "./metadata";
import { PYTHON_PACKAGE_PATTERN, comparePythonPackages, pythonPackageDetails } from "./lookup";
const name = z
  .string()
  .min(1)
  .max(214)
  .regex(PYTHON_PACKAGE_PATTERN, "Use a Python package name such as requests or scikit-learn, without a URL or version selector.")
  .describe("PyPI package name, e.g. requests or scikit-learn. No URL or version selector.");
export function registerPypiPackages(server: McpServer) {
  server.registerTool("python_package_details", { ...toolMeta(PYPI_PACKAGES_TOOLS, "python_package_details"), inputSchema: z.object({ name }) },
    billableTool("pypi-packages", "python_package_details", (a: { name: string }) => pythonPackageDetails(a.name)));
  server.registerTool("compare_python_packages", { ...toolMeta(PYPI_PACKAGES_TOOLS, "compare_python_packages"), inputSchema: z.object({ names: z.array(name).min(2).max(5).describe("2 to 5 PyPI package names, e.g. [\"requests\", \"httpx\"].") }) },
    billableTool("pypi-packages", "compare_python_packages", (a: { names: string[] }) => comparePythonPackages(a.names)));
}
