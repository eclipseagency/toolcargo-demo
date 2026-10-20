import { setDemoTransport, type FetchedResource } from "@/lib/connectors/site-audit/safe-fetch";
import { DEMO_PAGE_HTML, DEMO_ROBOTS, DEMO_SITEMAP, crossrefWork, europePmcRecord, pypiProject } from "./fixtures";

/**
 * Offline mode (the default): connector code runs unchanged, but its two network
 * seams answer from synthetic fixtures. Set TOOLCARGO_DEMO_MODE=live to call the
 * real public APIs instead. No credentials are used in either mode.
 */
export const demoMode = (): "offline" | "live" => (process.env.TOOLCARGO_DEMO_MODE === "live" ? "live" : "offline");

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export async function offlineJsonFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin === "https://api.crossref.org") {
    if (url.pathname === "/works") {
      const rows = Number(url.searchParams.get("rows") ?? 5);
      const items = [crossrefWork(), crossrefWork("10.5555/demo.2024.002", "Bounded Outputs for Agent Tools")].slice(0, rows);
      return json({ status: "ok", "message-type": "work-list", message: { items, "total-results": 2 } });
    }
    const doi = decodeURIComponent(url.pathname.slice("/works/".length));
    return doi.toLowerCase().startsWith("10.5555/") ? json({ status: "ok", "message-type": "work", message: crossrefWork(doi) }) : json({ status: "failed" }, 404);
  }
  if (url.origin === "https://www.ebi.ac.uk" && url.pathname === "/europepmc/webservices/rest/search") {
    const p = url.searchParams;
    const query = p.get("query") ?? "";
    const exact = /^EXT_ID:(\S+) AND SRC:([A-Z]+)$/.exec(query);
    const items = exact ? [europePmcRecord(exact[1].replace(/\\-/g, "-"), exact[2])] : [europePmcRecord()];
    return json({ hitCount: items.length, request: { queryString: query, pageSize: Number(p.get("pageSize")), cursorMark: p.get("cursorMark") }, resultList: { result: items } });
  }
  if (url.origin === "https://pypi.org") {
    const m = /^\/pypi\/([^/]+)\/json$/.exec(url.pathname);
    if (m) return json(pypiProject(decodeURIComponent(m[1])));
  }
  return json({ error: "No offline fixture for this request." }, 404);
}

function page(url: URL, status: number, contentType: string, body: string): FetchedResource {
  return { requestedUrl: url.toString(), finalUrl: url.toString(), status, redirects: [], headers: { "content-type": contentType, "strict-transport-security": "max-age=31536000" }, body: Buffer.from(body), truncated: false, elapsedMs: 1 };
}

export async function offlinePageFetch(url: URL): Promise<FetchedResource> {
  if (url.pathname === "/robots.txt") return page(url, 200, "text/plain", DEMO_ROBOTS);
  if (url.pathname === "/sitemap.xml") return page(url, 200, "application/xml", DEMO_SITEMAP);
  if (url.pathname === "/missing") return page(url, 404, "text/html", "<title>Not found</title>");
  if (url.pathname.endsWith(".png")) return page(url, 404, "text/plain", "");
  return page(url, 200, "text/html; charset=utf-8", DEMO_PAGE_HTML.replace("https://example.com/", `${url.origin}/`));
}

let installed = false;
/** Installs the offline seams once. Returns the active mode. */
export function installDemoMode(): "offline" | "live" {
  const mode = demoMode();
  if (mode === "offline" && !installed) {
    globalThis.fetch = offlineJsonFetch as typeof fetch;
    setDemoTransport(offlinePageFetch);
    installed = true;
  }
  return mode;
}
