/* WAF Test Lab report model: the numbers a PDF report prints must match
 * the on-screen lab (same verdictOf, same protection thresholds).
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildWafLabReport,
  protectionOf,
  reportFileName,
  verdictOf,
  type CatalogAttack,
  type WafTestResult,
} from "../src/lib/reports/wafLabReport.ts";

const catalog: CatalogAttack[] = [
  { id: "sqli", name: "SQLi", group: "SQL injection", method: "GET", path: "/?q=' OR 1=1", expect: "block" },
  { id: "xss", name: "XSS", group: "XSS", method: "GET", path: "/?q=<script>", expect: "block" },
  { id: "xxe", name: "XXE", group: "XXE", method: "POST", path: "/import", expect: "block" },
  { id: "benign", name: "Benign", group: "Control", method: "GET", path: "/", expect: "allow" },
  { id: "notrun", name: "Not run", group: "Control", method: "GET", path: "/x", expect: "block" },
];

const results: Record<string, WafTestResult | undefined> = {
  sqli: { ok: true, status: 403, blocked: true, waf_rule: "waf-rule-sqli-001", support_id: "abc", latency_ms: 12 },
  xss: { ok: true, status: 200, blocked: false, latency_ms: 9 },
  xxe: { ok: false, error: "timeout" },
  benign: { ok: true, status: 200, blocked: false },
};

test("summary counts separate relay errors from answered requests", () => {
  const r = buildWafLabReport({ catalog, results, target: "secure.example.com", environment: "prod" });
  assert.deepEqual(r.summary, {
    catalogSize: 5,
    ran: 4,
    reached: 3, // xxe errored in the relay, so it never got an answer
    errors: 1,
    blocked: 1,
    asExpected: 2, // sqli blocked, benign passed
    unexpected: 2, // xss not blocked, xxe error
    blockRatePct: 33,
    protection: "exposed", // 1 of 3 < half
  });
});

test("rows carry outcome, rule and verdict per attack", () => {
  const r = buildWafLabReport({ catalog, results, target: "t", environment: "prod" });
  const byName = Object.fromEntries(r.rows.map((row) => [row.name, row]));
  assert.equal(byName.SQLi.outcome, "blocked");
  assert.equal(byName.SQLi.rule, "waf-rule-sqli-001");
  assert.equal(byName.SQLi.pass, true);
  assert.equal(byName.XSS.outcome, "reached origin");
  assert.equal(byName.XSS.pass, false);
  assert.equal(byName.XXE.outcome, "error");
  assert.equal(byName.XXE.error, "timeout");
  assert.equal(byName.Benign.pass, true);
  assert.equal(byName["Not run"].outcome, "not run");
  assert.equal(byName["Not run"].pass, null);
  assert.deepEqual(r.rows.map((row) => row.index), [1, 2, 3, 4, 5]);
});

test("groups keep catalog order and tally per category", () => {
  const r = buildWafLabReport({ catalog, results, target: "t", environment: "prod" });
  assert.deepEqual(r.groups.map((g) => g.group), ["SQL injection", "XSS", "XXE", "Control"]);
  assert.deepEqual(r.groups[3], { group: "Control", tests: 2, ran: 1, blocked: 0, asExpected: 1 });
});

test("protection thresholds match the on-screen banner", () => {
  assert.equal(protectionOf(2, 2), "insufficient");
  assert.equal(protectionOf(3, 1), "exposed");
  assert.equal(protectionOf(4, 2), "active");
  assert.equal(protectionOf(28, 14), "active");
  assert.equal(protectionOf(28, 13), "exposed");
});

test("verdictOf is the single source for pass/fail", () => {
  assert.deepEqual(verdictOf(catalog[0]), { ok: null, label: "—" });
  assert.equal(verdictOf(catalog[0], results.sqli).ok, true);
  assert.equal(verdictOf(catalog[3], { ok: true, blocked: true }).ok, false);
});

test("file name is filesystem safe", () => {
  const at = new Date(2026, 8, 25, 9, 5);
  assert.equal(reportFileName("secure.example.com", at), "waf-lab-secure.example.com-2026-09-25-0905.pdf");
  assert.equal(reportFileName("https://a.b/c?d", at), "waf-lab-a.b-2026-09-25-0905.pdf");
  assert.equal(reportFileName("", at), "waf-lab-target-2026-09-25-0905.pdf");
});
