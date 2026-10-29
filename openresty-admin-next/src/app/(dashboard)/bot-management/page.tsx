"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Bot, RotateCw, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { useNotification } from "@/contexts/NotificationContext";
import BotNav from "@/components/bot-management/BotNav";
import HourlyChart from "@/components/bot-management/HourlyChart";
import {
  MODE_BADGE,
  fmtNumber,
  fmtTime,
  saveServerPolicy,
  useBotOverview,
  type BotServerSummary,
} from "@/components/bot-management/api";
import type { BotDefenseMode } from "@/components/servers/botDefenseTypes";

const MODE_OPTIONS: { value: BotDefenseMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "monitor", label: "Monitor" },
  { value: "challenge", label: "Challenge" },
  { value: "block", label: "Block" },
];

const SECRET_NOTE: Record<string, { ok: boolean; text: string }> = {
  settings: { ok: true, text: "From settings (bot_defense.secret) — set the same value on every edge." },
  derived: { ok: true, text: "Derived from the JWT passphrase — shared by the edges of one environment." },
  random: { ok: false, text: "Random per host — sessions do not carry between edges. Set bot_defense.secret in SOPS." },
  worker: { ok: false, text: "Random per worker — the shared dict is missing; sessions break between workers." },
};

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "warning" | "success" }) {
  const toneCls =
    tone === "danger" ? "text-red-700 dark:text-red-400"
      : tone === "warning" ? "text-amber-700 dark:text-amber-400"
        : tone === "success" ? "text-emerald-700 dark:text-emerald-400"
          : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#122233]">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

export default function BotManagementOverviewPage() {
  const { notify } = useNotification();
  const { data, error, isLoading, isValidating, mutate } = useBotOverview();
  const [query, setQuery] = useState("");
  const [onlyProtected, setOnlyProtected] = useState(false);
  const [pending, setPending] = useState<{ server: BotServerSummary; mode: BotDefenseMode } | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const engine = data?.engine;
  const totals = data?.stats.totals;
  const scored = useMemo(
    () => Object.values(totals?.class ?? {}).reduce((a, b) => a + (b ?? 0), 0),
    [totals],
  );
  const challengeFails = useMemo(
    () => Object.entries(totals?.challenge ?? {}).filter(([k]) => k !== "passed").reduce((a, [, v]) => a + v, 0),
    [totals],
  );

  const servers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.servers ?? []).filter(
      (s) => (!onlyProtected || s.mode !== "off") && (!q || s.server_name?.toLowerCase().includes(q)),
    );
  }, [data?.servers, query, onlyProtected]);

  const applyMode = useCallback(
    async (server: BotServerSummary, mode: BotDefenseMode) => {
      setSaving(true);
      try {
        // Keep everything else the server already has; only the mode changes.
        await saveServerPolicy(server.id, { ...(server.bot_defense ?? {}), mode });
        notify(`${server.server_name}: Bot Defense ${mode}`, { type: "success" });
        await mutate();
      } catch (e) {
        notify(`Could not change ${server.server_name}: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
      } finally {
        setSaving(false);
        setPending(null);
      }
    },
    [mutate, notify],
  );

  const requestMode = useCallback(
    (server: BotServerSummary, mode: BotDefenseMode) => {
      if (mode === server.mode) return;
      // Acting modes change what real visitors get: confirm. Off/monitor do not.
      if (mode === "challenge" || mode === "block") setPending({ server, mode });
      else void applyMode(server, mode);
    },
    [applyMode],
  );

  const columns = useMemo<Column<BotServerSummary>[]>(
    () => [
      {
        field: "server_name",
        label: "Server",
        render: (s) => (
          <Link
            href={`/servers/${encodeURIComponent(s.id)}?tab=waf` as Route}
            className="font-mono text-sm text-primary-600 hover:underline dark:text-primary-400"
          >
            {s.server_name}
          </Link>
        ),
      },
      {
        field: "mode",
        label: "Mode",
        width: "11rem",
        render: (s) => (
          <Select
            aria-label={`Bot Defense mode for ${s.server_name}`}
            value={s.mode}
            disabled={saving}
            onChange={(e) => requestMode(s, e.target.value as BotDefenseMode)}
            options={MODE_OPTIONS}
          />
        ),
      },
      {
        field: "thresholds",
        label: "Challenge / block at",
        width: "9rem",
        render: (s) =>
          s.mode === "off" ? (
            <span className="text-sm text-slate-400">—</span>
          ) : (
            <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
              {s.challenge_at} / {s.block_at}
            </span>
          ),
      },
      {
        field: "paths",
        label: "Paths",
        render: (s) =>
          s.mode === "off" ? (
            <span className="text-sm text-slate-400">—</span>
          ) : (
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {s.challenge_paths} challenge · {s.login_paths} login · {s.monitor_paths} score-only · {s.skip_paths} skip
            </span>
          ),
      },
      {
        field: "last24h",
        label: "Last 24 h",
        render: (s) => {
          const h = data?.stats.hosts[s.server_name];
          if (s.mode === "off" || !h) return <span className="text-sm text-slate-400">—</span>;
          return (
            <span className="text-xs tabular-nums text-slate-700 dark:text-slate-300">
              {fmtNumber(h.human)} human · {fmtNumber(h.suspect)} suspect · {fmtNumber(h.bot)} bot
            </span>
          );
        },
      },
    ],
    [data?.stats.hosts, requestMode, saving],
  );

  return (
    <div>
      <PageHeader
        title="Bot Management"
        icon={Bot}
        subtitle="Native bot defense and invalid-traffic (IVT) classification — no external service"
        actions={
          <Button variant="ghost" onClick={() => mutate()} loading={isValidating} aria-label="Refresh">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">Refresh</span>
          </Button>
        }
      />
      <BotNav />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Could not load Bot Management: {(error as Error).message}. The edge may not have the Bot Defense code yet.
        </div>
      )}

      {/* ── Engine status ─────────────────────────────────────────────── */}
      {engine && (
        <Card className="mb-6">
          <Card.Header>
            <div className="flex items-center gap-2">
              {engine.loaded ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
              )}
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Engine on this edge</h2>
            </div>
            <Badge variant={engine.loaded ? "success" : "warning"} size="sm">
              {engine.loaded ? "loaded" : "not loaded"}
            </Badge>
          </Card.Header>
          <Card.Body>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Session / challenge key</dt>
                <dd className="flex items-start gap-1.5 text-slate-900 dark:text-slate-100">
                  {engine.secret_source && !SECRET_NOTE[engine.secret_source]?.ok && (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="warning" />
                  )}
                  {SECRET_NOTE[engine.secret_source ?? ""]?.text ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Behaviour store</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {engine.dict_ok
                    ? `${engine.dict} (${fmtNumber(Math.round((engine.dict_free_bytes ?? 0) / 1024))} KiB free)`
                    : `${engine.dict ?? "wsl_bot_defense"} missing — behaviour signals off (deploy nginx mode)`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Browser check</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {engine.pow_difficulty ?? "—"}-bit proof of work · passed for {Math.round((engine.passed_ttl_s ?? 0) / 60)} min · IP binding {engine.ip_binding}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Data-centre ranges</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {fmtNumber(engine.datacenter_ranges)} loaded
                  {engine.datacenter_rejected ? ` · ${engine.datacenter_rejected} rejected` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Crawler DNS</dt>
                <dd className="font-mono text-xs text-slate-900 dark:text-slate-100">
                  {(engine.dns_nameservers ?? []).join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Settings</dt>
                <dd className="text-slate-900 dark:text-slate-100">
                  {engine.overlay_active ? "Edited here (Settings & signals)" : "Defaults / SOPS"} · loaded {fmtTime(engine.loaded_at)}
                </dd>
              </div>
            </dl>
          </Card.Body>
        </Card>
      )}

      {/* ── Last 24 h ─────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Scored" value={fmtNumber(scored)} hint="requests, last 24 h" />
        <Tile label="Human" value={fmtNumber(totals?.class.human)} tone="success" />
        <Tile label="Suspect" value={fmtNumber(totals?.class.suspect)} tone="warning" />
        <Tile label="Bot" value={fmtNumber(totals?.class.bot)} tone="danger" />
        <Tile
          label="Blocked"
          value={fmtNumber(totals?.action.block)}
          hint={`${fmtNumber(totals?.action.challenge)} challenged · ${fmtNumber(totals?.challenge.passed)} passed · ${fmtNumber(challengeFails)} refused`}
        />
        <Tile
          label="Invalid traffic"
          value={fmtNumber((totals?.ivt.givt ?? 0) + (totals?.ivt.sivt ?? 0))}
          hint={`${fmtNumber(totals?.ivt.givt)} general · ${fmtNumber(totals?.ivt.sivt)} sophisticated`}
        />
      </div>

      <Card className="mb-6">
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Requests per hour</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">protected servers, last 24 h</span>
        </Card.Header>
        <Card.Body>
          <HourlyChart rows={data?.stats.hourly ?? []} />
        </Card.Body>
      </Card>

      {/* ── Servers ───────────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Servers</h2>
          <div className="flex gap-2">
            {(["block", "challenge", "monitor", "off"] as BotDefenseMode[]).map((m) => (
              <Badge key={m} variant={MODE_BADGE[m]} size="sm">
                {fmtNumber(data?.servers_by_mode[m])} {m}
              </Badge>
            ))}
          </div>
        </Card.Header>
        <Card.Body>
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="w-72">
              <Input label="Filter" placeholder="host name" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={onlyProtected}
                onChange={(e) => { setOnlyProtected(e.target.checked); setPage(1); }}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Protected only
            </label>
          </div>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            Changing a mode applies on the next request — no reload. Paths, thresholds and limits are on each
            server&apos;s WAF tab (click the name). Start new hosts on monitor.
          </p>
          <DataTable
            columns={columns}
            data={servers.slice((page - 1) * perPage, page * perPage)}
            total={servers.length}
            page={page}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
            loading={isLoading}
            error={error}
            onRetry={() => mutate()}
            emptyMessage={query || onlyProtected ? "No servers match." : "No servers on this edge."}
            getId={(s) => s.id}
          />
        </Card.Body>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `Turn on ${pending.mode} for ${pending.server.server_name}?` : ""}
        message={
          pending?.mode === "block"
            ? "Suspects and bots get a 403. Scripts and API clients cannot pass — make sure webhooks and machine-to-machine paths are in the server's skip list."
            : "Suspects get the browser check and bots a 403. Scripts and API clients cannot run the check — make sure webhooks and machine-to-machine paths are in the server's skip list."
        }
        confirmLabel={pending ? `Use ${pending.mode}` : "Confirm"}
        confirmVariant={pending?.mode === "block" ? "danger" : "primary"}
        loading={saving}
        onConfirm={() => pending && applyMode(pending.server, pending.mode)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
