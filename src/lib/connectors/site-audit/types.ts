/**
 * Finding model. Output contract (documented in /docs/site-audit#output):
 *
 * - `severity` keeps its original values for compatibility (error | warning | notice | pass)
 *   and follows one explicit rule:
 *     error   = blocks indexing, sharing or the page itself (high impact)
 *     warning = likely reduces visibility, click-through or preview quality (medium)
 *     notice  = best practice or hygiene; fix when convenient (low)
 *     pass    = the check ran and found no problem
 * - `status` says whether the check passed, failed, or could not be completed
 *   (`not_checked`, with the reason in `evidence`).
 * - `evidence` is what we observed; `why` explains the impact; `fix` is the recommendation.
 * - `detail` is kept as an alias of `evidence` for older consumers.
 */

/**
 * Version of the check set. Bump when a check is added, removed or its rule changes,
 * so saved audits from different versions are compared with a warning.
 */
export const CHECKS_VERSION = "site-audit/2026-09-11";

export type Severity = "error" | "warning" | "notice" | "pass";
export type CheckStatus = "pass" | "fail" | "not_checked";

export type Area =
  | "fetch"
  | "indexing"
  | "metadata"
  | "content"
  | "social"
  | "structured-data"
  | "international"
  | "security"
  | "links";

export type Finding = {
  id: string;
  area: Area;
  severity: Severity;
  status?: CheckStatus;
  title: string;
  evidence?: string;
  why?: string;
  fix?: string;
  /** @deprecated alias of `evidence`, kept for compatibility. */
  detail?: string;
};

/**
 * Overall result of fetching the page, decided before any page-level check:
 *   completed  — HTML page returned; all checks ran
 *   page_error — the server answered 404/410/5xx; only response checks ran
 *   blocked    — 401/403/429 or a bot challenge; we could not see the real page
 *   not_html   — the URL is not an HTML page (PDF, image, JSON…)
 * A fetch that never got a response (DNS, TLS, timeout, refused URL) is not an
 * outcome: the tool reports an error and the call is not counted.
 */
export type AuditOutcome = "completed" | "page_error" | "blocked" | "not_html";

export const OUTCOME_LABEL: Record<AuditOutcome, string> = {
  completed: "Audit completed",
  page_error: "Page returned an error — page content not audited",
  blocked: "Blocked by the site — the real page could not be audited",
  not_html: "Not an HTML page — page checks do not apply",
};

export const SEVERITY_RULE: Record<Exclude<Severity, "pass">, string> = {
  error: "High — blocks indexing, sharing or the page itself",
  warning: "Medium — likely reduces visibility, click-through or preview quality",
  notice: "Low — best practice or hygiene; fix when convenient",
};

export type Summary = { errors: number; warnings: number; notices: number; passed: number; notChecked: number };

export const statusOf = (f: Finding): CheckStatus => f.status ?? (f.severity === "pass" ? "pass" : "fail");

export function summarise(findings: Finding[]): Summary {
  const s: Summary = { errors: 0, warnings: 0, notices: 0, passed: 0, notChecked: 0 };
  for (const f of findings) {
    const st = statusOf(f);
    if (st === "not_checked") s.notChecked++;
    else if (f.severity === "error") s.errors++;
    else if (f.severity === "warning") s.warnings++;
    else if (f.severity === "notice") s.notices++;
    else s.passed++;
  }
  return s;
}

/** Heuristic 0-100 score for completed audits only: a quick signal, not a ranking prediction. */
export function heuristicScore(s: Summary): number {
  return Math.max(0, 100 - s.errors * 12 - s.warnings * 5 - s.notices);
}

const ICON: Record<CheckStatus | Severity, string> = { error: "✖", warning: "▲", notice: "•", pass: "✓", fail: "✖", not_checked: "○" };
const ORDER: Record<Severity, number> = { error: 0, warning: 1, notice: 2, pass: 3 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const na = statusOf(a) === "not_checked" ? 1 : 0;
    const nb = statusOf(b) === "not_checked" ? 1 : 0;
    return na - nb || ORDER[a.severity] - ORDER[b.severity];
  });
}

const IMPACT: Record<Severity, string> = { error: "High", warning: "Medium", notice: "Low", pass: "" };

export function findingsToMarkdown(findings: Finding[], { includePasses = true } = {}): string {
  return sortFindings(findings)
    .filter((f) => includePasses || f.severity !== "pass")
    .map((f) => {
      const st = statusOf(f);
      if (st === "not_checked") return `- ${ICON.not_checked} **Not checked: ${f.title}**${f.evidence ? ` — ${f.evidence}` : ""}`;
      if (st === "pass") return `- ${ICON.pass} **${f.title}**${f.evidence ? ` — ${f.evidence}` : ""}`;
      let line = `- ${ICON[f.severity]} **${f.title}** (${IMPACT[f.severity]} impact)`;
      if (f.evidence) line += `\n  Evidence: ${f.evidence}`;
      if (f.why) line += `\n  Why it matters: ${f.why}`;
      if (f.fix) line += `\n  Fix: ${f.fix}`;
      return line;
    })
    .join("\n");
}
