"use client";

import { useMemo, useState } from "react";
import { Radar, RotateCw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import BotNav from "@/components/bot-management/BotNav";
import {
  ACTION_BADGE,
  CLASS_BADGE,
  IVT_BADGE,
  IVT_LABEL,
  fmtTime,
  useBotEvents,
  type BotEvent,
} from "@/components/bot-management/api";

/* Live decision feed: one entry per suspicious visitor per action per
   minute, plus every browser-check result.  Kept in the edge's shared dict
   (last 500), so it clears on an nginx restart. */

const CLASS_OPTIONS = [
  { value: "", label: "Any class" },
  { value: "bot", label: "Bot" },
  { value: "suspect", label: "Suspect" },
  { value: "human", label: "Human (on challenge paths)" },
  { value: "verified_bot", label: "Verified crawler" },
];
const ACTION_OPTIONS = [
  { value: "", label: "Any action" },
  { value: "block", label: "Block" },
  { value: "challenge", label: "Challenge" },
  { value: "allow", label: "Allow (monitor / score-only)" },
];
const TYPE_OPTIONS = [
  { value: "", label: "Decisions + checks" },
  { value: "decision", label: "Decisions" },
  { value: "challenge", label: "Browser-check results" },
];

const PER_PAGE_DEFAULT = 50;

export default function BotEventsPage() {
  const [host, setHost] = useState("");
  const [klass, setKlass] = useState("");
  const [action, setAction] = useState("");
  const [type, setType] = useState("");
  const [auto, setAuto] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_DEFAULT);

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (host.trim()) f.host = host.trim();
    if (klass) f.class = klass;
    if (action) f.action = action;
    if (type) f.type = type;
    return f;
  }, [host, klass, action, type]);

  const { data, error, isLoading, isValidating, mutate } = useBotEvents(filters, auto);
  const all = data ?? [];
  const rows = all.slice((page - 1) * perPage, page * perPage);

  const columns = useMemo<Column<BotEvent>[]>(
    () => [
      {
        field: "ts",
        label: "When",
        width: "11rem",
        render: (e) => <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">{fmtTime(e.ts)}</span>,
      },
      {
        field: "verdict",
        label: "Verdict",
        width: "12rem",
        render: (e) =>
          e.type === "challenge" ? (
            <Badge variant={e.result === "passed" ? "success" : "danger"} size="sm">
              check {e.result?.replace(/_/g, " ")}
            </Badge>
          ) : (
            <div className="flex flex-wrap gap-1">
              {e.class && <Badge variant={CLASS_BADGE[e.class]} size="sm">{e.class.replace("_", " ")}</Badge>}
              {e.action && <Badge variant={ACTION_BADGE[e.action] ?? "default"} size="sm">{e.action}</Badge>}
            </div>
          ),
      },
      {
        field: "score",
        label: "Score / IVT",
        width: "9rem",
        render: (e) =>
          e.type === "challenge" ? (
            <span className="text-sm text-slate-400">—</span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">{e.score ?? 0}</span>
              {e.ivt && <Badge variant={IVT_BADGE[e.ivt]} size="sm">{IVT_LABEL[e.ivt]}</Badge>}
            </div>
          ),
      },
      {
        field: "host",
        label: "Request",
        render: (e) => (
          <div className="max-w-sm">
            <div className="truncate font-mono text-xs text-slate-800 dark:text-slate-200" title={`${e.host ?? ""}${e.uri ?? ""}`}>
              {e.method ? `${e.method} ` : ""}
              {e.host}
              {e.uri ?? ""}
            </div>
            <div className="truncate text-xs text-slate-500 dark:text-slate-400" title={e.ua}>
              {e.ip} · {e.ua || "no User-Agent"}
            </div>
          </div>
        ),
      },
      {
        field: "signals",
        label: "Signals",
        render: (e) =>
          e.signals ? (
            <div className="flex max-w-xs flex-wrap gap-1">
              {e.signals.split(",").map((s) => (
                <code key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {s.replace(/^BD_/, "")}
                </code>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          ),
      },
      {
        field: "support_id",
        label: "Status · support ID",
        width: "12rem",
        render: (e) => (
          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400" title={e.support_id}>
            {e.status ?? ""} {e.support_id ? `· ${e.support_id.slice(0, 12)}…` : ""}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Bot events"
        icon={Radar}
        subtitle="Live decisions and browser-check results from this edge"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Auto-refresh
            </label>
            <Button variant="ghost" onClick={() => mutate()} loading={isValidating} aria-label="Refresh events">
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5">Refresh</span>
            </Button>
          </div>
        }
      />
      <BotNav />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Host" placeholder="shop.example.com" value={host} onChange={(e) => { setHost(e.target.value); setPage(1); }} />
        <Select label="Class" value={klass} onChange={(e) => { setKlass(e.target.value); setPage(1); }} options={CLASS_OPTIONS} />
        <Select label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} options={ACTION_OPTIONS} />
        <Select label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} options={TYPE_OPTIONS} />
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Failed to load events: {(error as Error).message}
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        total={all.length}
        loading={isLoading}
        error={error}
        onRetry={() => mutate()}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
        emptyMessage={
          Object.keys(filters).length
            ? "No events match the filters."
            : "No bot activity recorded yet — decisions appear here as protected servers see suspicious traffic."
        }
        getId={(e) => String(e.seq)}
      />
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        One entry per suspicious visitor per action per minute (bounded under attack) and every browser-check result;
        the last 500 are kept in memory on this edge. A user quoting a Support ID can be found with the host filter and
        the ID column.
      </p>
    </div>
  );
}
