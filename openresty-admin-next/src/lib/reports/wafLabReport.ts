/* WAF Test Lab report model.
 *
 * Pure data: turns the lab's catalog + results into what a report shows
 * (summary, per-category breakdown, one row per attack). No DOM, no PDF
 * library, no path aliases, so node --test can import it directly and the
 * on-screen verdicts and the PDF are computed by the same code.
 */

export interface WafTestResult {
  ok: boolean;
  error?: string;
  status?: number;
  blocked?: boolean;
  waf_block?: boolean;
  waf_rule?: string | null;
  waf_violation?: string | null;
  support_id?: string | null;
  server?: string | null;
  content_type?: string | null;
  latency_ms?: number;
  target?: string;
  path?: string;
  method?: string;
  body_snippet?: string;
}

export interface CatalogAttack {
  id: string;
  name: string;
  group: string;
  method: string;
  path: string;
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
  expect: "block" | "allow";
  notes?: string;
}

export interface Verdict {
  /** true = behaved as expected, false = did not, null = not run. */
  ok: boolean | null;
  label: string;
}

export function verdictOf(a: CatalogAttack, r?: WafTestResult): Verdict {
  if (!r) return { ok: null, label: "—" };
  if (!r.ok) return { ok: false, label: r.error ? "error" : "failed" };
  const blocked = !!r.blocked;
  if (a.expect === "block") return { ok: blocked, label: blocked ? "blocked ✓" : "NOT blocked ✗" };
  return { ok: !blocked, label: blocked ? "blocked ✗" : "passed ✓" };
}

export type ProtectionVerdict = "active" | "exposed" | "insufficient";

export interface ReportRow {
  index: number;
  name: string;
  group: string;
  method: string;
  path: string;
  expect: "block" | "allow";
  ran: boolean;
  status: string;
  outcome: "blocked" | "reached origin" | "error" | "not run";
  rule: string;
  supportId: string;
  latencyMs: number | null;
  error: string;
  pass: boolean | null;
  notes: string;
}

export interface GroupSummary {
  group: string;
  tests: number;
  ran: number;
  blocked: number;
  asExpected: number;
}

export interface WafLabReport {
  target: string;
  environment: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  generatedAt: Date;
  summary: {
    catalogSize: number;
    ran: number;
    reached: number;
    errors: number;
    blocked: number;
    asExpected: number;
    unexpected: number;
    blockRatePct: number | null;
    protection: ProtectionVerdict;
  };
  groups: GroupSummary[];
  rows: ReportRow[];
}

/**
 * Banner verdict, shared by the lab page and the PDF: needs 3+ answered
 * requests, and "active" means half or more of them were blocked. ceil, not
 * floor: floor(3 * 0.5) = 1 called 1-of-3 blocked (33%) "WAF active".
 */
export function protectionOf(reached: number, blocked: number): ProtectionVerdict {
  if (reached < 3) return "insufficient";
  return blocked >= Math.ceil(reached / 2) ? "active" : "exposed";
}

export function buildWafLabReport(input: {
  catalog: CatalogAttack[];
  results: Record<string, WafTestResult | undefined>;
  target: string;
  environment: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  generatedAt?: Date;
}): WafLabReport {
  const { catalog, results } = input;
  const rows: ReportRow[] = catalog.map((a, i) => {
    const r = results[a.id];
    const v = verdictOf(a, r);
    const outcome: ReportRow["outcome"] = !r
      ? "not run"
      : !r.ok
        ? "error"
        : r.blocked
          ? "blocked"
          : "reached origin";
    const rule = [r?.waf_rule, r?.waf_violation && r.waf_violation !== r.waf_rule ? r.waf_violation : null]
      .filter(Boolean)
      .join(" / ");
    return {
      index: i + 1,
      name: a.name,
      group: a.group,
      method: a.method,
      path: a.path,
      expect: a.expect,
      ran: !!r,
      status: r?.ok && r.status != null ? String(r.status) : r ? "n/a" : "",
      outcome,
      rule,
      supportId: r?.support_id ?? "",
      latencyMs: r?.latency_ms ?? null,
      error: r && !r.ok ? r.error ?? "failed" : "",
      pass: v.ok,
      notes: a.notes ?? "",
    };
  });

  const ranRows = rows.filter((r) => r.ran);
  const reachedRows = ranRows.filter((r) => r.outcome !== "error");
  const blocked = reachedRows.filter((r) => r.outcome === "blocked").length;
  const asExpected = ranRows.filter((r) => r.pass === true).length;

  const groupOrder: string[] = [];
  const byGroup = new Map<string, GroupSummary>();
  for (const row of rows) {
    let g = byGroup.get(row.group);
    if (!g) {
      g = { group: row.group, tests: 0, ran: 0, blocked: 0, asExpected: 0 };
      byGroup.set(row.group, g);
      groupOrder.push(row.group);
    }
    g.tests += 1;
    if (row.ran) g.ran += 1;
    if (row.outcome === "blocked") g.blocked += 1;
    if (row.pass === true) g.asExpected += 1;
  }

  return {
    target: input.target,
    environment: input.environment,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    generatedAt: input.generatedAt ?? new Date(),
    summary: {
      catalogSize: catalog.length,
      ran: ranRows.length,
      reached: reachedRows.length,
      errors: ranRows.length - reachedRows.length,
      blocked,
      asExpected,
      unexpected: ranRows.length - asExpected,
      blockRatePct: reachedRows.length ? Math.round((blocked / reachedRows.length) * 100) : null,
      protection: protectionOf(reachedRows.length, blocked),
    },
    groups: groupOrder.map((g) => byGroup.get(g)!),
    rows,
  };
}

/** File name like waf-lab-secure.example.com-2026-09-25-0912.pdf. */
export function reportFileName(target: string, at: Date): string {
  const host = (target.replace(/^https?:\/\//, "").split("/")[0] || "target").replace(/[^a-zA-Z0-9.-]/g, "_");
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
  return `waf-lab-${host}-${stamp}.pdf`;
}
