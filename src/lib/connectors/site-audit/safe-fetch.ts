import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from "undici";
import { siteUrl } from "@/lib/site";

/**
 * Outbound fetcher for user-supplied URLs.
 *
 * The audit tools fetch arbitrary public URLs on a user's behalf, which is a
 * server-side request forgery risk. Every hop (including redirects) is checked:
 * http/https only, default ports only, no credentials in the URL, no private,
 * loopback, link-local, multicast or reserved addresses. The IP check runs
 * inside the socket's DNS lookup, so a hostname cannot resolve to a public IP
 * for the check and a private IP for the connection.
 */

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 96], ["::1", 128], ["64:ff9b:1::", 48], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8], ["2001:db8::", 32],
  ["100::", 64], ["2001::", 23], ["2002::", 16], ["3fff::", 20], ["5f00::", 16],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True when the address must never be contacted. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) embed an IPv4 address.
    const mapped = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    if (lower.startsWith("::ffff:") || lower.startsWith("64:ff9b:")) return true; // hex-form mapped: refuse
    return blocked.check(address, "ipv6");
  }
  return true;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

/** Validates a URL before any network activity. Throws FetchBlockedError. */
export function assertFetchableUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Not a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchBlockedError(`Only http and https URLs are supported (got ${url.protocol}).`);
  }
  if (url.username || url.password) throw new FetchBlockedError("URLs with embedded credentials are not fetched.");
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new FetchBlockedError("Only the default ports (80 and 443) are fetched.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".") && !isIP(host)) {
    throw new FetchBlockedError("Private or local hostnames are not fetched.");
  }
  if (isIP(host) && isBlockedAddress(host)) {
    throw new FetchBlockedError("Private, loopback and reserved IP addresses are not fetched.");
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: { all?: boolean } & Record<string, unknown>, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (!list.length || bad) {
      const e = new FetchBlockedError(`${hostname} resolves to a private or reserved address.`) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return callback(e, "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

const agent = new Agent({
  connect: { lookup: guardedLookup as never, timeout: 5_000 },
  headersTimeout: 8_000,
  bodyTimeout: 8_000,
  maxRedirections: 0,
} as ConstructorParameters<typeof Agent>[0]);

export const USER_AGENT = `ToolCargoAudit/0.1 (+${siteUrl()}/docs/site-audit#fetcher)`;

export type FetchedResource = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirects: { url: string; status: number }[];
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  elapsedMs: number;
};

export type SafeFetchOptions = {
  method?: "GET" | "HEAD";
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  accept?: string;
  /** Sent as Authorization. Never logged. Use with sameOrigin for credentialed calls. */
  authorization?: string;
  /** When true, redirects must stay on the first request's origin (no credential leak). */
  sameOrigin?: boolean;
};

/**
 * Demo edition only: an optional offline transport. When set (the default in the
 * portfolio demo), validated URLs are answered from synthetic fixtures and no
 * network request is made. Production has no such hook.
 */
export type DemoTransport = (url: URL, opts: SafeFetchOptions) => Promise<FetchedResource>;
let demoTransport: DemoTransport | null = null;
export function setDemoTransport(transport: DemoTransport | null): void {
  demoTransport = transport;
}

/** Fetches a URL with SSRF protection, manual redirect checks and a body cap. */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<FetchedResource> {
  const { method = "GET", maxBytes = 2_000_000, maxRedirects = 5, timeoutMs = 10_000 } = opts;
  const started = Date.now();
  const redirects: { url: string; status: number }[] = [];
  let current = assertFetchableUrl(raw);
  if (demoTransport) return demoTransport(current, opts);
  const origin = current.origin;
  const deadline = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; ; hop++) {
    let res: UndiciResponse;
    try {
      res = await undiciFetch(current, {
        method,
        redirect: "manual",
        dispatcher: agent,
        signal: deadline,
        headers: {
          "user-agent": USER_AGENT,
          accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en;q=0.9,*;q=0.5",
          ...(opts.authorization ? { authorization: opts.authorization } : {}),
        },
      });
    } catch (err) {
      throw unwrapFetchError(err);
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      redirects.push({ url: current.toString(), status: res.status });
      if (hop >= maxRedirects) throw new FetchBlockedError(`Stopped after ${maxRedirects} redirects.`);
      const next = assertFetchableUrl(new URL(location, current));
      if (opts.sameOrigin && next.origin !== origin) throw new FetchBlockedError("Redirect left the original host.");
      current = next;
      continue;
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body = Buffer.alloc(0);
    let truncated = false;
    if (method === "GET" && res.body) {
      const chunks: Buffer[] = [];
      let size = 0;
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            chunks.push(Buffer.from(value.subarray(0, value.byteLength - (size - maxBytes))));
            truncated = true;
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(Buffer.from(value));
        }
      } catch (err) {
        throw unwrapFetchError(err);
      }
      body = Buffer.concat(chunks);
    } else {
      await res.body?.cancel().catch(() => {});
    }

    return {
      requestedUrl: raw,
      finalUrl: current.toString(),
      status: res.status,
      redirects,
      headers,
      body,
      truncated,
      elapsedMs: Date.now() - started,
    };
  }
}

function unwrapFetchError(err: unknown): Error {
  let e: unknown = err;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    if (e instanceof FetchBlockedError) return e;
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EBLOCKED") return new FetchBlockedError((e as Error).message);
    if (code === "ENOTFOUND") return new Error("The hostname could not be resolved (DNS lookup failed).");
    if (code === "ECONNREFUSED") return new Error("The server refused the connection.");
    if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
      return new Error("The server did not respond in time.");
    }
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
      return new Error("The request timed out.");
    }
    if (code?.startsWith("ERR_TLS") || code?.includes("CERT")) return new Error(`TLS error: ${code}.`);
    e = (e as { cause?: unknown }).cause;
  }
  return new Error("The request failed before a response was received.");
}
