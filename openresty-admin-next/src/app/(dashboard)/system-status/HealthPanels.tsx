import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  FolderTree,
  Gauge,
  Globe,
  KeyRound,
  Link2,
  Network,
  Package,
  Server,
  Settings2,
  Wifi,
  XCircle,
  type LucideIcon,
} from "lucide-react";
// RSC-safe named imports for Card subcomponents — the compound
// `Card.Header` / `Card.Body` properties don't survive the
// server/client module boundary.
import Card, { CardBody, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { fetchHealthBundle } from "@/lib/dashboard/health-fetcher";
import { formatBytes } from "@/lib/utils/formatters";
import { env as clientEnv } from "@/lib/config/env";
import type { HealthBundle, HealthData } from "@/types";

/* ──────────────────────────────────────────────────────────────────────────
   Health page — pure Server Component, zero client JS.

   Architecture:
    - `fetchHealthBundle()` fans out to 3 endpoints in parallel
      (ping/detailed + instance/info + cache/stats) and returns a
      single `HealthBundle`.
    - The page renders 11 panels.  Each is a small stateless function
      that reads exactly the fields it needs from the bundle — no
      derivation of data at render time, keeping panels trivially
      testable.
    - Shared atoms (`StatusBadge`, `DefRow`, `BoolCell`, `Chip`)
      encapsulate colour + status conventions so changes propagate
      consistently.
   ────────────────────────────────────────────────────────────────────────── */

type StatusTone = "ok" | "warn" | "error" | "muted";

const STATUS_STYLES: Record<
  StatusTone,
  { bg: string; text: string; Icon: LucideIcon }
> = {
  ok: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    text: "text-emerald-600 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  warn: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    text: "text-amber-600 dark:text-amber-400",
    Icon: AlertTriangle,
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/30",
    text: "text-red-600 dark:text-red-400",
    Icon: XCircle,
  },
  muted: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-500 dark:text-slate-400",
    Icon: Activity,
  },
};

// ── Overall status derivation ───────────────────────────────────────────

function deriveOverallTone(health: HealthData): StatusTone {
  switch ((health.status ?? "").toLowerCase()) {
    case "healthy":
    case "ok":
      return "ok";
    case "degraded":
    case "warning":
      return "warn";
    case "":
      return "muted";
    default:
      return "error";
  }
}

function latencyTone(ms: number): StatusTone {
  if (ms <= 0) return "muted";
  if (ms < 1000) return "ok";
  if (ms < 3000) return "warn";
  return "error";
}

function usageTone(pct: number, warn: number, err: number): StatusTone {
  if (pct >= err) return "error";
  if (pct >= warn) return "warn";
  return "ok";
}

// ── Shared atoms ────────────────────────────────────────────────────────

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const s = STATUS_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}
    >
      <s.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function DefRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-slate-800">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span
        className={`text-right font-medium text-slate-900 dark:text-slate-100 ${
          mono ? "font-mono text-sm" : ""
        }`}
      >
        {children}
      </span>
    </div>
  );
}

function Empty({ value }: { value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-slate-300 dark:text-slate-600">N/A</span>;
  }
  return <>{value}</>;
}

function BoolCell({ value }: { value?: boolean }) {
  if (value === true)
    return (
      <CheckCircle2
        className="mx-auto h-4 w-4 text-emerald-500"
        aria-label="Yes"
      />
    );
  if (value === false)
    return (
      <XCircle className="mx-auto h-4 w-4 text-red-500" aria-label="No" />
    );
  return (
    <span className="mx-auto block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
  );
}

function PanelCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
        </div>
        {action}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

// ── Overall Status Banner ───────────────────────────────────────────────

function OverallBanner({ bundle }: { bundle: HealthBundle }) {
  const tone = deriveOverallTone(bundle.health);
  const s = STATUS_STYLES[tone];
  const label =
    tone === "ok"
      ? "Healthy"
      : tone === "warn"
        ? "Degraded"
        : tone === "muted"
          ? "Unknown"
          : bundle.health.status ?? "Unhealthy";
  const latency = bundle.meta.latency_ms;
  const lat = STATUS_STYLES[latencyTone(latency)];

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full ${s.bg} ${s.text}`}
      >
        <s.Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
          System Status
        </p>
        <p className={`text-lg font-bold ${s.text}`}>{label}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          tone={latencyTone(latency)}
          label={`${latency}ms`}
        />
        {bundle.meta.http_status > 0 && (
          <StatusBadge
            tone={bundle.meta.http_status < 400 ? "ok" : "error"}
            label={`HTTP ${bundle.meta.http_status}`}
          />
        )}
        <StatusBadge
          tone={bundle.meta.authenticated ? "ok" : "error"}
          label={bundle.meta.authenticated ? "Authenticated" : "No Auth"}
        />
        {/* Latency icon is purely decorative; actual tone is carried by
            the StatusBadge above.  Keep this shape stable even on
            `muted` so the banner layout doesn't jump. */}
        <span className={`text-[10px] font-mono ${lat.text}`}>●</span>
      </div>
    </div>
  );
}

// ── Panel: Services ─────────────────────────────────────────────────────

function ServicesPanel({ health }: { health: HealthData }) {
  const s = health.services;
  const redisTone =
    s?.redis?.status === "ok"
      ? "ok"
      : s?.redis?.status === "skipped"
        ? "muted"
        : "error";
  const workersTone = s?.nginx_workers?.status === "ok" ? "ok" : "error";
  const openrestyTone = s?.openresty?.status === "ok" ? "ok" : "muted";

  return (
    <PanelCard title="Services" icon={Server}>
      <dl>
        <DefRow label="OpenResty">
          <span className="inline-flex items-center gap-2">
            <StatusBadge tone={openrestyTone} label={s?.openresty?.status ?? "unknown"} />
            <span className="font-mono text-sm">
              <Empty value={s?.openresty?.version} />
            </span>
          </span>
        </DefRow>
        <DefRow label="Nginx Workers">
          <span className="inline-flex items-center gap-2">
            <StatusBadge tone={workersTone} label={s?.nginx_workers?.status ?? "unknown"} />
            <span className="tabular-nums">
              <Empty value={s?.nginx_workers?.worker_count} />
            </span>
          </span>
        </DefRow>
        <DefRow label="Redis">
          <StatusBadge tone={redisTone} label={s?.redis?.status ?? "unknown"} />
        </DefRow>
        {s?.redis?.host && (
          <DefRow label="Redis Endpoint" mono>
            {s.redis.host}
            {s.redis.port ? `:${s.redis.port}` : ""}
          </DefRow>
        )}
        {s?.redis?.message && (
          <DefRow label="Redis Message">{s.redis.message}</DefRow>
        )}
      </dl>
    </PanelCard>
  );
}

// ── Panel: API Health (meta captured by the server fetcher) ─────────────

function ApiHealthPanel({ bundle }: { bundle: HealthBundle }) {
  const statusTone =
    bundle.meta.http_status === 200
      ? "ok"
      : bundle.meta.http_status === 0
        ? "error"
        : "warn";

  return (
    <PanelCard title="API Health" icon={Activity}>
      <dl>
        <DefRow label="API URL" mono>
          <Empty value={bundle.meta.api_url} />
        </DefRow>
        <DefRow label="HTTP Status">
          <StatusBadge
            tone={statusTone}
            label={
              bundle.meta.http_status > 0
                ? String(bundle.meta.http_status)
                : "unreachable"
            }
          />
        </DefRow>
        <DefRow label="Authenticated">
          <StatusBadge
            tone={bundle.meta.authenticated ? "ok" : "error"}
            label={bundle.meta.authenticated ? "yes" : "no"}
          />
        </DefRow>
        <DefRow label="Latency">
          <StatusBadge
            tone={latencyTone(bundle.meta.latency_ms)}
            label={`${bundle.meta.latency_ms}ms`}
          />
        </DefRow>
        <DefRow label="Storage Type">
          <span className="font-mono text-sm">
            <Empty value={bundle.health.settings?.storage_type ?? bundle.health.system?.storage_type} />
          </span>
        </DefRow>
        <DefRow label="Env Profile">
          <span className="font-mono text-sm">
            <Empty value={bundle.health.settings?.env_profile ?? bundle.health.system?.env_profile} />
          </span>
        </DefRow>
        {bundle.meta.error && (
          <DefRow label="Error">
            <span className="text-red-600 dark:text-red-400">
              {bundle.meta.error}
            </span>
          </DefRow>
        )}
      </dl>
    </PanelCard>
  );
}

// ── Panel: System Info ──────────────────────────────────────────────────

function SystemPanel({ bundle }: { bundle: HealthBundle }) {
  const i = bundle.instance;
  const sys = bundle.health.system;

  // Usage extraction — the Lua ping response carries CPU% as a
  // string like "45.2", InstanceInfo as a number.  Normalize + derive
  // tone once so rendering stays trivial.
  const cpuPct = Number(
    sys?.cpu?.system_usage_percent ?? i.cpu?.usage_percent ?? NaN,
  );
  const diskPct = Number(String(i.disk?.percent ?? "").replace("%", ""));

  return (
    <PanelCard title="System" icon={Cpu}>
      <dl>
        <DefRow label="Hostname" mono>
          <Empty value={i.hostname ?? sys?.hostname} />
        </DefRow>
        <DefRow label="FQDN" mono>
          <Empty value={i.fqdn} />
        </DefRow>
        <DefRow label="OS">
          <Empty value={i.os} />
        </DefRow>
        <DefRow label="Kernel" mono>
          <Empty value={i.kernel} />
        </DefRow>
        <DefRow label="Uptime">
          <Empty value={i.uptime ?? sys?.uptime} />
        </DefRow>
        <DefRow label="Load Average" mono>
          <Empty value={i.load_average} />
        </DefRow>
        <DefRow label="CPU">
          <span className="inline-flex items-center gap-2">
            <Empty value={i.cpu?.model ?? `${sys?.cpu?.cores ?? "?"} cores`} />
            {Number.isFinite(cpuPct) && (
              <StatusBadge
                tone={usageTone(cpuPct, 70, 90)}
                label={`${cpuPct.toFixed(1)}%`}
              />
            )}
          </span>
        </DefRow>
        <DefRow label="Memory">
          {i.memory ? (
            <>
              <Empty value={i.memory.used} /> / <Empty value={i.memory.total} />
            </>
          ) : (
            <Empty value={null} />
          )}
        </DefRow>
        <DefRow label="Disk">
          {i.disk ? (
            <span className="inline-flex items-center gap-2">
              <span>
                <Empty value={i.disk.used} /> / <Empty value={i.disk.total} />
              </span>
              {Number.isFinite(diskPct) && (
                <StatusBadge
                  tone={usageTone(diskPct, 75, 90)}
                  label={i.disk.percent ?? `${diskPct.toFixed(0)}%`}
                />
              )}
            </span>
          ) : (
            <Empty value={null} />
          )}
        </DefRow>
      </dl>
    </PanelCard>
  );
}

// ── Panel: Build & Version ──────────────────────────────────────────────

function BuildVersionPanel({ health }: { health: HealthData }) {
  const sys = health.system;
  return (
    <PanelCard title="Build & Version" icon={Package}>
      <dl>
        <DefRow label="App">
          <Empty value={sys?.app ?? clientEnv.appName} />
        </DefRow>
        <DefRow label="Backend Version" mono>
          <Empty value={sys?.version} />
        </DefRow>
        <DefRow label="OpenResty" mono>
          <Empty value={sys?.openresty_version} />
        </DefRow>
        <DefRow label="Frontend Version" mono>
          <Empty value={clientEnv.appVersion} />
        </DefRow>
        <DefRow label="Build Number" mono>
          <Empty value={clientEnv.buildNumber} />
        </DefRow>
        <DefRow label="Deployment Time" mono>
          <Empty value={sys?.deployment_time ?? clientEnv.deploymentTime} />
        </DefRow>
        <DefRow label="Platform">
          <span className="font-mono text-sm">
            <Empty value={clientEnv.targetPlatform} />
          </span>
        </DefRow>
        {sys?.swagger_url && (
          <DefRow label="API Docs" mono>
            <a
              href={sys.swagger_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline dark:text-primary-400"
            >
              {sys.swagger_url}
            </a>
          </DefRow>
        )}
      </dl>
    </PanelCard>
  );
}

// ── Panel: Settings Validation ──────────────────────────────────────────

function SettingsValidationPanel({ health }: { health: HealthData }) {
  const s = health.settings;
  const overallTone =
    s?.status === "ok"
      ? "ok"
      : s?.status === "warning"
        ? "warn"
        : s?.status
          ? "error"
          : "muted";

  return (
    <PanelCard
      title="Settings Validation"
      icon={Settings2}
      action={<StatusBadge tone={overallTone} label={s?.status ?? "unknown"} />}
    >
      <dl>
        <DefRow label="File Exists">
          <BoolCell value={s?.file_exists} />
        </DefRow>
        <DefRow label="Valid JSON">
          <BoolCell value={s?.valid_json} />
        </DefRow>
        {s?.error && (
          <DefRow label="Error">
            <span className="text-red-600 dark:text-red-400">{s.error}</span>
          </DefRow>
        )}
      </dl>
      {s?.missing_keys && s.missing_keys.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            Missing Keys
          </p>
          <div className="flex flex-wrap gap-1.5">
            {s.missing_keys.map((k) => (
              <Badge key={k} variant="warning" size="sm">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </PanelCard>
  );
}

// ── Panel: Frontend Environment ─────────────────────────────────────────

function FrontendEnvPanel({ health }: { health: HealthData }) {
  const fe = health.frontend_env;
  const tone: StatusTone =
    fe?.status === "ok" ? "ok" : fe?.status === "warning" ? "warn" : "muted";

  return (
    <PanelCard
      title="Frontend Environment"
      icon={Globe}
      action={<StatusBadge tone={tone} label={fe?.status ?? "unknown"} />}
    >
      <dl>
        <DefRow label="File Exists">
          <BoolCell value={fe?.file_exists} />
        </DefRow>
        {fe?.env_path && (
          <DefRow label="Path" mono>
            {fe.env_path}
          </DefRow>
        )}
        {fe?.variables &&
          Object.entries(fe.variables).map(([k, v]) => (
            <DefRow key={k} label={k} mono>
              <Empty value={v} />
            </DefRow>
          ))}
      </dl>
      {fe?.missing && fe.missing.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            Missing Variables
          </p>
          <div className="flex flex-wrap gap-1.5">
            {fe.missing.map((k) => (
              <Badge key={k} variant="warning" size="sm">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {fe?.note && (
        <p className="mt-3 text-sm italic leading-relaxed text-slate-600 dark:text-slate-400">
          {fe.note}
        </p>
      )}
    </PanelCard>
  );
}

// ── Panel: Backend Environment ──────────────────────────────────────────

function BackendEnvPanel({ health }: { health: HealthData }) {
  const be = health.environment?.backend;
  return (
    <PanelCard title="Backend Environment" icon={KeyRound}>
      {be && Object.keys(be).length > 0 ? (
        <dl>
          {Object.entries(be).map(([k, v]) => (
            <DefRow key={k} label={k} mono>
              {typeof v === "string" &&
              (v === "Not Found" || v === "not found") ? (
                <StatusBadge tone="error" label={v} />
              ) : v === "Found" ? (
                <StatusBadge tone="ok" label={v} />
              ) : (
                <Empty value={v} />
              )}
            </DefRow>
          ))}
        </dl>
      ) : (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">
          No backend environment reported.
        </p>
      )}
    </PanelCard>
  );
}

// ── Panel: Data Directories ─────────────────────────────────────────────

function DataDirectoriesPanel({ health }: { health: HealthData }) {
  const dirs = health.data_directories;
  const entries = dirs ? Object.entries(dirs) : [];

  return (
    <PanelCard title="Data Directories" icon={FolderTree}>
      {entries.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <th className="py-2 text-left font-semibold">Path</th>
                <th className="py-2 text-center font-semibold">Exists</th>
                <th className="py-2 text-center font-semibold">Read</th>
                <th className="py-2 text-center font-semibold">Write</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map(([path, meta]) => (
                <tr key={path}>
                  <td className="py-1.5 font-mono text-slate-700 dark:text-slate-300">
                    {path}
                  </td>
                  <td className="py-1.5 text-center">
                    <BoolCell value={meta.exists} />
                  </td>
                  <td className="py-1.5 text-center">
                    <BoolCell value={meta.readable} />
                  </td>
                  <td className="py-1.5 text-center">
                    <BoolCell value={meta.writable} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">
          No directory data available.
        </p>
      )}
    </PanelCard>
  );
}

// ── Panel: Cache Stats ──────────────────────────────────────────────────

function CacheStatsPanel({ bundle }: { bundle: HealthBundle }) {
  const c = bundle.cache;
  const available = c.available === true;
  return (
    <PanelCard
      title="Cache Stats"
      icon={Database}
      action={
        <StatusBadge
          tone={available ? "ok" : "muted"}
          label={available ? "active" : "disabled"}
        />
      }
    >
      <dl>
        <DefRow label="Total Entries">
          <span className="tabular-nums">
            <Empty value={c.total_entries} />
          </span>
        </DefRow>
        <DefRow label="Cache Size">
          {typeof c.total_size_bytes === "number" ? (
            formatBytes(c.total_size_bytes)
          ) : (
            <Empty value={null} />
          )}
        </DefRow>
        <DefRow label="Dict Capacity">
          <Empty value={c.dict_capacity} />
        </DefRow>
        <DefRow label="Dict Free">
          <Empty value={c.dict_free_space} />
        </DefRow>
      </dl>
    </PanelCard>
  );
}

// ── Panel: Network ──────────────────────────────────────────────────────

function NetworkPanel({ bundle }: { bundle: HealthBundle }) {
  const be = bundle.health.environment?.backend ?? {};
  const ips = bundle.instance.ip_addresses ?? [];
  return (
    <PanelCard title="Network" icon={Network}>
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            IP Addresses
          </p>
          {ips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {ips.map((ip) => (
                <span
                  key={ip}
                  className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2.5 py-1 font-mono text-sm font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                >
                  <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                  {ip}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-slate-600 dark:text-slate-400">
              No interfaces reported
            </p>
          )}
        </div>
        <dl>
          <DefRow label="Primary DNS" mono>
            <Empty value={be.PRIMARY_DNS_RESOLVER} />
          </DefRow>
          <DefRow label="Secondary DNS" mono>
            <Empty value={be.SECONDARY_DNS_RESOLVER} />
          </DefRow>
          <DefRow label="DNS Port" mono>
            <Empty value={be.DNS_RESOLVER_PORT} />
          </DefRow>
          {be.FRONT_URL && (
            <DefRow label="Frontdoor URL" mono>
              <a
                href={be.FRONT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
              >
                <Link2 className="h-3 w-3" aria-hidden="true" />
                {be.FRONT_URL}
              </a>
            </DefRow>
          )}
        </dl>
      </div>
    </PanelCard>
  );
}

// ── Panel: Nginx Tuning (read-only peek at the running config) ─────────

function NginxTuningPanel({ health }: { health: HealthData }) {
  const n = health.system?.nginx;
  if (!n) return null;

  return (
    <PanelCard title="Nginx Tuning" icon={Gauge}>
      <dl>
        <DefRow label="Worker Processes" mono>
          <span className="tabular-nums">
            <Empty value={n.worker_processes_conf} />
          </span>
        </DefRow>
        <DefRow label="Worker Count" mono>
          <span className="tabular-nums">
            <Empty value={n.worker_count} />
          </span>
        </DefRow>
        <DefRow label="Worker Connections" mono>
          <span className="tabular-nums">
            <Empty value={n.worker_connections} />
          </span>
        </DefRow>
        <DefRow label="Open Files Limit" mono>
          <span className="tabular-nums">
            <Empty value={n.open_files_limit} />
          </span>
        </DefRow>
        <DefRow label="Memory (RSS)" mono>
          {n.memory_rss_mb != null ? `${n.memory_rss_mb} MB` : <Empty value={null} />}
        </DefRow>
        <DefRow label="Memory (VSZ)" mono>
          {n.memory_vsz_mb != null ? `${n.memory_vsz_mb} MB` : <Empty value={null} />}
        </DefRow>
      </dl>
    </PanelCard>
  );
}

// ── Page entry ──────────────────────────────────────────────────────────

export default async function HealthPanels() {
  const bundle = await fetchHealthBundle();

  return (
    <>
      <OverallBanner bundle={bundle} />

      {bundle.meta.error && (
        <div
          className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          role="alert"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Failed to reach the ping endpoint.</p>
            <p className="mt-0.5 text-xs opacity-90">{bundle.meta.error}</p>
          </div>
        </div>
      )}

      {/* Responsive 2-up grid on desktop.  Each panel is autonomous so
          slow-loading data in one doesn't push the others around. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ServicesPanel health={bundle.health} />
        <ApiHealthPanel bundle={bundle} />
        <SystemPanel bundle={bundle} />
        <BuildVersionPanel health={bundle.health} />
        <SettingsValidationPanel health={bundle.health} />
        <FrontendEnvPanel health={bundle.health} />
        <BackendEnvPanel health={bundle.health} />
        <CacheStatsPanel bundle={bundle} />
        <NetworkPanel bundle={bundle} />
        <NginxTuningPanel health={bundle.health} />
        {/* Data directories panel spans full width since its table is
            wider than the 2-column grid slots. */}
        <div className="lg:col-span-2">
          <DataDirectoriesPanel health={bundle.health} />
        </div>
      </div>
    </>
  );
}
