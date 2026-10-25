# ToolCargo: portfolio / demo edition

> **This is a portfolio/demo edition, not the production codebase.** It contains a
> runnable selection of genuine ToolCargo connector code with offline fixtures. The
> hosted product is at **[toolcargo.com](https://toolcargo.com)**. Source-available
> for viewing only; see [LICENSE](LICENSE). Not open source.

ToolCargo is a store of hosted [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) connectors that let AI assistants such as Claude and ChatGPT use real tools: website
audits, analytics and ads platforms, research databases, package registries and more.
Users connect once with an account key or OAuth and add the connectors they need.

## What is in this demo

| Connector | Tools | Code |
|---|---|---|
| **Site Audit** (core) | `audit_page`, `check_links`, `check_crawl_rules`, `check_social_preview` | `src/lib/connectors/site-audit/` |
| **Crossref Research** | `search_publications`, `publication_details` | `src/lib/connectors/crossref/` |
| **Europe PMC Research** | `europe_pmc_search_publications`, `europe_pmc_publication_details` | `src/lib/connectors/europe-pmc/` |
| **PyPI Package Intelligence** | `python_package_details`, `compare_python_packages` | `src/lib/connectors/pypi-packages/` |

The connector modules, the SSRF-guarded fetcher, the HTML parser and audit checks,
the public-API transport and their unit tests are taken from the production code.
The demo adds a small MCP server, a local playground UI and an offline mode.

## Architecture

```
MCP client (Claude, an IDE, the demo UI)
        │  MCP (stdio here; Streamable HTTP in production)
        ▼
McpServer ── register*(server)        connector registration + zod input schemas
        │
        ├── lookup.ts / tools.ts      validation, bounded output projection, source notes
        │
        ├── public-http.ts            fixed-origin JSON transport for key-free public APIs
        └── site-audit/safe-fetch.ts  SSRF guard (DNS-time IP checks, redirect re-checks, size caps)
                 │
                 ▼
        offline fixtures (default)  or  real public endpoints (TOOLCARGO_DEMO_MODE=live)
```

Design rules visible in the code:

- **Validate first, then fetch.** Every input is checked (DOI syntax, package names,
  year ranges, URL scheme/host/port) before any request; SSRF checks still run in
  offline mode.
- **Bounded, projected output.** Connectors return a fixed subset of fields with explicit
  caps and "missing metadata" lists, never raw upstream payloads, author emails or full text.
- **Upstream text is untrusted data.** Each result ends with a source note telling the
  assistant what the data is and is not.
- **Read-only tools** with MCP annotations (`readOnlyHint`, `idempotentHint`).

What production has that this demo leaves out: accounts and OAuth 2.1, API keys and
scopes, plans, metering and rate limits, billing, saved audit history, scheduled page
watches, the catalogue website and the dozens of other connectors.

## Run it

Requires Node.js 22.19.0 or newer.

```bash
npm ci
npm test          # deterministic, offline
npm run build     # strict TypeScript compile check
npm run demo      # playground UI at http://127.0.0.1:3000
npm run mcp       # MCP server over stdio
```

Offline mode is the default: tools answer from synthetic fixtures in `src/demo/fixtures.ts`
(for example, audit `https://example.com/` or look up DOI `10.5555/demo.2024.001`).
To call the real public APIs instead:

```bash
TOOLCARGO_DEMO_MODE=live npm run demo
```

No API keys or accounts are needed in either mode. See `.env.example`.

### Use it from an MCP client

```json
{
  "mcpServers": {
    "toolcargo-demo": { "command": "npx", "args": ["tsx", "/path/to/toolcargo-demo/src/mcp/stdio.ts"] }
  }
}
```

## Layout

```
src/lib/connectors/   genuine connector code (site-audit core, crossref, europe-pmc, pypi-packages)
src/lib/catalog/      connector/tool metadata types (subset)
src/lib/mcp/          demo stand-ins for the production metering wrappers
src/lib/audit-compare.ts  run-comparison helpers from the production audit history
src/demo/             offline mode and synthetic fixtures
src/mcp/              demo MCP server (stdio + in-memory client)
src/ui/               local playground UI
tests/                unit tests from production + an end-to-end MCP test
```

## License

Copyright (c) 2026 Eclipse Agency. All rights reserved. Source-available for viewing and
local evaluation only; see [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
Security reports: [SECURITY.md](SECURITY.md).
