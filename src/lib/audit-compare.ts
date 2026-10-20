// Pure comparison helpers extracted from the production audit-history module (storage removed for the demo).
import type { AuditOutcome, Finding } from "@/lib/connectors/site-audit/types";

export function pageKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${host}${path}${u.search}`;
  } catch {
    return url;
  }
}

// ------------------------------------------------------------------ compare

export type CompareItem = { id: string; title: string; severity: Finding["severity"]; before?: Finding; after?: Finding };
export type Comparison = {
  comparable: boolean;
  reason?: string;
  /** Set when the runs used different check sets: differences may come from the checks, not the page. */
  versionNotice?: string;
  fixed: CompareItem[];
  introduced: CompareItem[];
  unchanged: CompareItem[];
  notComparable: CompareItem[];
  scoreDelta: number | null;
};

const failing = (f?: Finding) => Boolean(f && (f.status ?? (f.severity === "pass" ? "pass" : "fail")) === "fail");
const unchecked = (f?: Finding) => f?.status === "not_checked";

/**
 * Compares an earlier and a later run of the same page, check by check (finding id).
 * - fixed:        failing before; passing (or no longer reported) after
 * - introduced:   not failing before; failing after
 * - unchanged:    failing in both (title may differ, e.g. a new length)
 * - notComparable: either side couldn't run the check (blocked, page error)
 * A run that wasn't completed can't show page-level fixes: its unchecked groups
 * go to notComparable instead of looking "fixed".
 */
type Comparable = { findings: Finding[]; outcome: AuditOutcome; score: number | null; check_version?: string };

export function compareRuns(before: Comparable, after: Comparable): Comparison {
  const mapB = new Map(before.findings.map((f) => [f.id, f]));
  const mapA = new Map(after.findings.map((f) => [f.id, f]));
  const ids = [...new Set([...mapB.keys(), ...mapA.keys()])];
  const out: Comparison = { comparable: true, fixed: [], introduced: [], unchanged: [], notComparable: [], scoreDelta: null };
  const bothCompleted = before.outcome === "completed" && after.outcome === "completed";
  if (!bothCompleted) {
    out.comparable = false;
    out.reason = `Only runs that completed can be compared check by check (before: ${before.outcome}, after: ${after.outcome}).`;
  }
  if (before.check_version && after.check_version && before.check_version !== after.check_version) {
    out.versionNotice = `These runs used different check versions (${before.check_version} → ${after.check_version}). A change can come from a new or updated check rather than from the page.`;
  }
  for (const id of ids) {
    const b = mapB.get(id);
    const a = mapA.get(id);
    const item: CompareItem = { id, title: (a ?? b)!.title, severity: (failing(a) ? a! : b ?? a)!.severity, before: b, after: a };
    if (unchecked(b) || unchecked(a) || !bothCompleted) {
      if (failing(b) || failing(a) || unchecked(b) || unchecked(a)) out.notComparable.push(item);
      continue;
    }
    if (failing(b) && !failing(a)) out.fixed.push({ ...item, severity: b!.severity });
    else if (!failing(b) && failing(a)) out.introduced.push(item);
    else if (failing(b) && failing(a)) out.unchanged.push(item);
  }
  if (before.score != null && after.score != null) out.scoreDelta = after.score - before.score;
  const rank = { error: 0, warning: 1, notice: 2, pass: 3 } as const;
  for (const list of [out.fixed, out.introduced, out.unchanged, out.notComparable]) list.sort((x, y) => rank[x.severity] - rank[y.severity]);
  return out;
}
