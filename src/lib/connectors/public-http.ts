import { UserFacingError } from "@/lib/mcp/metered";

/** Key-free public APIs only. Callers supply a reviewed, fixed origin; user inputs become encoded parameters. */
export function createPublicJson(options: { name: string; origin: string; maxBytes?: number; timeoutMs?: number; includeLink?: boolean; contactEmail?: string; onResponse?: (meta: { status: number; retryAfter: string | null }) => void }) {
  const origin = new URL(options.origin);
  if (options.contactEmail !== undefined && (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(options.contactEmail) || options.contactEmail.length > 254)) throw new Error("Public API contact must be a plain public email address.");
  const userAgent = `ToolCargo/1.0 (+https://toolcargo.com/support${options.contactEmail ? `; ${options.contactEmail}` : ""})`;
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("Public API origin must be a bare HTTPS origin.");
  return async (path: string, request?: { method: "POST"; body: Record<string, unknown> }): Promise<unknown> => {
    const url = new URL(path, origin);
    if (!path.startsWith("/") || path.startsWith("//") || url.origin !== origin.origin || url.username || url.password || url.hash) throw new UserFacingError("Invalid public API request path.");
    let body: string | undefined;
    if (request) {
      if (request.method !== "POST") throw new UserFacingError("Invalid public API request method.");
      try { body = JSON.stringify(request.body); }
      catch { throw new UserFacingError("Invalid public API request body."); }
      if (!body || Buffer.byteLength(body, "utf8") > 10_000) throw new UserFacingError("Public API request body is too large or empty.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs ?? 10_000, 20_000));
    try {
      const response = await fetch(url, { ...(request ? { method: "POST", body } : {}), headers: { accept: "application/json", "user-agent": userAgent, ...(request ? { "content-type": "application/json" } : {}) }, redirect: "error", cache: "no-store", signal: controller.signal });
      // Opt-in provider scheduling signal; never exposes cookies or arbitrary headers.
      try { options.onResponse?.({ status: response.status, retryAfter: response.headers.get("retry-after") }); }
      catch (error) { await response.body?.cancel(); throw error; }
      if (!response.ok) {
        await response.body?.cancel();
        throw new UserFacingError(response.status === 429 ? `${options.name} rate-limited this request. Try again later.` : `${options.name} returned HTTP ${response.status}. The requested data may be unavailable.`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new UserFacingError(`${options.name} returned an empty response.`);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > (options.maxBytes ?? 2_000_000)) {
          await reader.cancel();
          throw new UserFacingError(`${options.name} returned too much data. Narrow the request.`);
        }
        chunks.push(value);
      }
      let data: unknown;
      try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
      catch { throw new UserFacingError(`${options.name} returned invalid JSON.`); }
      if (!options.includeLink) return data;
      const link = response.headers.get("link");
      if (link && link.length > 8192) throw new UserFacingError(`${options.name} returned too much pagination metadata. Narrow the request.`);
      // Header exposure is opt-in. Callers validate a cursor; this transport never follows links.
      return { data, link };
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      throw new UserFacingError(`Could not reach ${options.name}. Try again later.`);
    } finally { clearTimeout(timer); }
  };
}
