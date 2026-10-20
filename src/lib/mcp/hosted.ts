import type { ConnectorTool } from "@/lib/catalog/connectors";
import { UserFacingError } from "@/lib/mcp/metered";

/**
 * Demo edition of the hosted-tool helpers. Production wraps every tool in
 * authentication, plan entitlement, rate limiting and usage metering; the demo
 * runs the same connector code directly and returns plain MCP text results.
 */
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export const text = (t: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError } : {}),
});

export const toolMeta = (tools: ConnectorTool[], name: string, extra?: { openWorld?: boolean; readOnly?: boolean }) => {
  const t = tools.find((x) => x.name === name)!;
  const readOnly = extra?.readOnly ?? t.readOnly;
  return {
    title: t.title,
    description: t.description,
    annotations: { title: t.title, readOnlyHint: readOnly, destructiveHint: false, idempotentHint: true, openWorldHint: extra?.openWorld ?? true },
  };
};

export function billableTool<A>(_slug: string, _tool: string, run: (args: A) => Promise<string> | string) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return text(await run(args));
    } catch (err) {
      if (err instanceof UserFacingError || (err as Error)?.name === "AuditInputError") return text((err as Error).message, true);
      return text("The tool failed. Please try again.", true);
    }
  };
}

export { UserFacingError };
