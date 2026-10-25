# Maintaining the public demo

This repository is a source-available portfolio demo, not the private hosted ToolCargo product. Its existing viewing/evaluation license is unchanged. A public repository does not by itself grant an open-source license.

Dependabot pull requests titled **Bump** propose dependency version updates. A pull request does not change main until reviewed and merged. Some bumps fix security advisories; others provide routine maintenance. A security alert identifies an affected dependency version, not proof that someone exploited the demo.

- Review security alerts promptly; keep security updates and secret scanning enabled.
- Group routine minor/patch updates weekly. Security minor/patch fixes have their own group. Major updates remain separate because they can require migrations.
- Do not enable automatic merges. Review the diff, then require CI build and tests before merging.
- Locally run `npm ci --ignore-scripts`, `npm run typecheck`, `npm run build`, `npm test`, and `npm audit`.
- Keep `THIRD-PARTY-NOTICES.md` and the documented Node minimum aligned with the lockfile.
- Keep account credentials, customer data and private production code out of this demo.

## 2026-10-25 maintenance

Updated MCP server/client, Undici, Zod, tsx and Vitest to address the open dependency advisories and tested routine updates. TypeScript remains5.9.3: the separate proposed7.0.2 upgrade fails CI because it removes `baseUrl` and requires relative path mappings. Review that migration separately rather than accepting a failing major update.

There is no production deployment workflow in this repository. Publishing these changes to main updates the public demo only.

Reference: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
