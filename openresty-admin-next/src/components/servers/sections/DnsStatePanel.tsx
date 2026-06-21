"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Cloud,
  RefreshCw,
  PlayCircle,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Eye,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useDataProvider } from "@/hooks/useResource";
import DnsProvisionDialog from "./DnsProvisionDialog";

/**
 * "DNS State (Cloudflare)" panel — lives on the server form.
 *
 * Shows the current Cloudflare records for `serverName`, annotated
 * with which ones wslproxy manages.  Surfaces three operator
 * actions:
 *   1. Refresh — re-fetch from Cloudflare
 *   2. Preview & Provision — opens DnsProvisionDialog (dry-run plan
 *      first, then apply)
 *   3. (implicit) "Configure DNS" link when the backend says the
 *      dns block is missing
 *
 * Why this lives on the server form rather than its own page:
 *   - DNS provisioning is per-server.  The state and actions are
 *     meaningful only in the context of *this* server's pop_ids and
 *     server_name.
 *   - Operators editing pop_ids will want to immediately see the
 *     DNS impact and apply it without navigating away.
 *
 * Hidden during create-mode — there's no persisted server to
 * provision DNS for yet.  Once the server is saved, the panel
 * appears on subsequent edits.
 */

interface Record {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  comment?: string;
  managed_by_wslproxy: boolean;
  pop_id?: string;
}

interface LookupResult {
  domain: string;
  zone_id: string;
  zone_name: string;
  records: Record[];
}

// Matches the ApiError class thrown by apiFetch — fields are flat on
// the error instance itself, not nested in `body`.  parseBackendError
// extracts these from the backend's `{ error: { message, code,
// details } }` envelope.
interface ApiError {
  message?: string;
  code?: string;
  status?: number;
  details?: {
    managed_zones?: string[];
    /** Set on provider_error / network_error responses by
     *  dns_manager.lua so the operator sees *which* zone CF refused. */
    zone?: { name: string; id: string };
    /** Cloudflare's underlying HTTP status (e.g. 403). */
    http_status?: number;
    /** Cloudflare's structured errors array. */
    cloudflare_errors?: Array<{ code: number; message: string }>;
  };
}

interface DnsStatePanelProps {
  serverId: string;
  profileId: string;
  serverName: string;
  popIds: string[];
  isCreate: boolean;
}

export default function DnsStatePanel({
  serverId,
  profileId,
  serverName,
  popIds,
  isCreate,
}: DnsStatePanelProps) {
  const dataProvider = useDataProvider();

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchLookup = useCallback(async () => {
    if (isCreate || !serverName) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dataProvider.lookupDns(serverName, "A");
      const data = (res?.data ?? null) as LookupResult | null;
      if (data && !Array.isArray(data.records)) {
        // Backend may serialise an empty record set as `{}` (JSON object)
        // rather than `[]`; coerce so `records.filter/map/length` are safe.
        data.records = [];
      }
      setLookup(data);
    } catch (err) {
      setError(err as ApiError);
      setLookup(null);
    } finally {
      setLoading(false);
    }
  }, [dataProvider, serverName, isCreate]);

  useEffect(() => {
    void fetchLookup();
  }, [fetchLookup]);

  // Hide entirely in create mode — the rest of the form makes no
  // sense to render here until the server has been persisted.
  if (isCreate) return null;

  return (
    <>
      <Card>
        <Card.Header>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                DNS State (Cloudflare)
              </h3>
              {lookup && (
                <Badge variant="info" size="sm">
                  {lookup.records.length} record
                  {lookup.records.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchLookup}
                loading={loading}
                icon={<RefreshCw className="h-4 w-4" />}
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setDialogOpen(true)}
                disabled={popIds.length === 0 || Boolean(error)}
                icon={<PlayCircle className="h-4 w-4" />}
              >
                Preview &amp; Provision
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          <DnsStateBody
            serverName={serverName}
            popIds={popIds}
            loading={loading}
            error={error}
            lookup={lookup}
          />
        </Card.Body>
      </Card>

      <DnsProvisionDialog
        open={dialogOpen}
        serverId={serverId}
        profileId={profileId}
        serverName={serverName}
        onClose={() => setDialogOpen(false)}
        onApplied={() => {
          // Re-fetch lookup after a successful apply so the panel
          // reflects the new state without requiring a page reload.
          void fetchLookup();
        }}
      />
    </>
  );
}

// Extracted into a sub-component so the main panel's render stays
// readable.  Branches on the operator-visible state machine: missing
// config → zone not allowed → no POPs → loading → error → empty →
// records.
function DnsStateBody({
  serverName,
  popIds,
  loading,
  error,
  lookup,
}: {
  serverName: string;
  popIds: string[];
  loading: boolean;
  error: ApiError | null;
  lookup: LookupResult | null;
}) {
  // ── Specific, helpful error states ──────────────────────────────
  if (error) {
    const code = error.code;
    const message = error.message;
    if (code === "not_configured" || code === "disabled") {
      return (
        <InfoBanner
          tone="info"
          title="DNS provisioning is not configured"
          body={
            <>
              <p>{message}</p>
              <p className="mt-2 text-xs">
                Add a <code>dns</code> block to{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                  data/settings.json
                </code>{" "}
                with your Cloudflare API token and the list of zones wslproxy
                may write to.  See the README for the schema.
              </p>
            </>
          }
        />
      );
    }
    if (code === "zone_not_allowed") {
      const allowed = error.details?.managed_zones ?? [];
      return (
        <InfoBanner
          tone="warning"
          title={`No managed zone covers ${serverName}`}
          body={
            <>
              <p>{message}</p>
              {allowed.length > 0 && (
                <div className="mt-2 text-xs">
                  Currently allowed zones:{" "}
                  {allowed.map((z, i) => (
                    <span key={z}>
                      <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                        {z}
                      </code>
                      {i < allowed.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
            </>
          }
        />
      );
    }
    if (code === "zone_not_found") {
      return (
        <InfoBanner
          tone="warning"
          title={`No Cloudflare zone found for ${serverName}`}
          body={
            <>
              <p>{message}</p>
              <p className="mt-2 text-xs">
                Auto-discovery is on, so wslproxy looked this domain up in
                Cloudflare directly.  Make sure the parent zone exists in your
                Cloudflare account and the API token has{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                  Zone:Read
                </code>{" "}
                access to it.
              </p>
            </>
          }
        />
      );
    }
    if (code === "no_cname_target") {
      return (
        <InfoBanner
          tone="warning"
          title="CNAME target not set"
          body={
            <p>
              You picked <strong>CNAME</strong> mode for this server but
              haven&apos;t set the target hostname yet.  Scroll up to the{" "}
              <strong>DNS Record Type</strong> card and fill in the
              <em> CNAME target</em> input.
            </p>
          }
        />
      );
    }
    if (code === "provider_error" || code === "network_error") {
      const zone = error.details?.zone;
      const cfHttp = error.details?.http_status;
      const cfErrors = error.details?.cloudflare_errors ?? [];
      // Detect the placeholder zone_id (all zeros) explicitly — that's
      // the most common reason new operators see "Authentication
      // error" right after configuring the dns block.  Surface it as
      // a clear "this is a placeholder, replace it" message rather
      // than dumping the CF error.
      const isPlaceholder =
        zone?.id !== undefined && /^0+$/.test(zone.id);
      const title = isPlaceholder
        ? "Replace the placeholder zone in settings.json"
        : code === "network_error"
          ? "Could not reach Cloudflare"
          : `Cloudflare rejected the request${cfHttp ? ` (HTTP ${cfHttp})` : ""}`;
      return (
        <InfoBanner
          tone={isPlaceholder ? "info" : "warning"}
          title={title}
          body={
            <div className="space-y-2">
              {isPlaceholder ? (
                <p>
                  The configured zone_id for{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                    {zone?.name}
                  </code>{" "}
                  is a placeholder (<code>{zone?.id}</code>).  Cloudflare
                  refused the lookup because no zone has that id.  Edit{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                    data/settings.json
                  </code>{" "}
                  → <code>dns.providers[0].managed_zones</code> and replace
                  the placeholder with a real <code>zone_id</code> from your
                  Cloudflare dashboard (copy from the right sidebar of the
                  zone&apos;s overview page).
                </p>
              ) : (
                <p>{message}</p>
              )}
              {zone && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  Zone tried: <code>{zone.name}</code> ·{" "}
                  <code className="text-slate-500">{zone.id}</code>
                </div>
              )}
              {cfErrors.length > 0 && (
                <div className="text-xs">
                  Cloudflare said:{" "}
                  {cfErrors.map((e, i) => (
                    <span key={i}>
                      <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">
                        {e.code}: {e.message}
                      </code>
                      {i < cfErrors.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          }
        />
      );
    }
    return (
      <InfoBanner
        tone="error"
        title="Could not load DNS state"
        body={<p>{message || "Unknown error"}</p>}
      />
    );
  }

  // ── Loading / empty pre-conditions ──────────────────────────────
  if (loading && !lookup) {
    return <p className="text-sm text-slate-500">Loading current records…</p>;
  }

  if (popIds.length === 0) {
    return (
      <InfoBanner
        tone="info"
        title="No POPs assigned"
        body={
          <p>
            This server has no POPs assigned, so DNS provisioning has nothing
            to publish.  Pick at least one POP in the section above to enable
            this.
          </p>
        }
      />
    );
  }

  // ── Records visible ─────────────────────────────────────────────
  if (lookup) {
    const managed = lookup.records.filter((r) => r.managed_by_wslproxy);
    const unmanaged = lookup.records.filter((r) => !r.managed_by_wslproxy);
    return (
      <div className="space-y-4">
        <ZoneSummary zoneName={lookup.zone_name} zoneId={lookup.zone_id} />

        {lookup.records.length === 0 && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
            Cloudflare has no records for <code>{serverName}</code> yet.  Click
            <strong> Preview &amp; Provision</strong> to publish A records for
            this server&apos;s POPs.
          </p>
        )}

        {managed.length > 0 && (
          <RecordGroup
            title="Managed by wslproxy"
            badge="success"
            description="These records were created by wslproxy and will be reconciled on each provision."
            records={managed}
          />
        )}

        {unmanaged.length > 0 && (
          <RecordGroup
            title="External records"
            badge="default"
            description="These records exist in Cloudflare but were NOT created by wslproxy.  They will never be modified or deleted by the provisioner."
            records={unmanaged}
          />
        )}
      </div>
    );
  }

  return null;
}

// ── Sub-components ───────────────────────────────────────────────────

function ZoneSummary({ zoneName, zoneId }: { zoneName: string; zoneId: string }) {
  // External link to the zone in Cloudflare's UI — handy for ops
  // wanting to inspect a record directly.  Uses CF's known URL
  // pattern; falls back gracefully if CF ever changes it (link
  // breaks, but our UI doesn't).
  const cfUrl = `https://dash.cloudflare.com/?to=/:account/${encodeURIComponent(zoneName)}/dns/records`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50">
      <span className="text-slate-600 dark:text-slate-400">Zone:</span>
      <code className="font-mono text-slate-700 dark:text-slate-300">
        {zoneName}
      </code>
      <span className="text-slate-400">·</span>
      <code className="font-mono text-slate-500">{zoneId}</code>
      <Link
        href={cfUrl as Route}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-primary-600 dark:hover:text-primary-400"
      >
        Open in Cloudflare <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

function RecordGroup({
  title,
  badge,
  description,
  records,
}: {
  title: string;
  badge: "success" | "default";
  description: string;
  records: Record[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {title}
        </span>
        <Badge variant={badge} size="sm">
          {records.length}
        </Badge>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
      <div className="space-y-1.5">
        {records.map((r) => (
          <RecordRow key={r.id} record={r} />
        ))}
      </div>
    </div>
  );
}

function RecordRow({ record }: { record: Record }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/50">
      <Badge variant="default" size="sm">
        {record.type}
      </Badge>
      <code className="font-mono font-semibold text-slate-700 dark:text-slate-300">
        {record.content}
      </code>
      {record.pop_id && (
        <Badge variant="info" size="sm">
          pop={record.pop_id}
        </Badge>
      )}
      <span className="text-slate-500">TTL {record.ttl}s</span>
      {record.proxied && (
        <Badge variant="warning" size="sm">
          proxied
        </Badge>
      )}
      {record.managed_by_wslproxy && (
        <span className="ml-auto inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-3 w-3" />
          managed
        </span>
      )}
      {!record.managed_by_wslproxy && (
        <span className="ml-auto inline-flex items-center gap-1 text-slate-500">
          <Eye className="h-3 w-3" />
          external
        </span>
      )}
    </div>
  );
}

// Generic info/warning/error banner used across the panel's states.
// Kept here (not in the ui/ kit) because the specific styling is
// scoped to this panel's needs.
function InfoBanner({
  tone,
  title,
  body,
}: {
  tone: "info" | "warning" | "error";
  title: string;
  body: React.ReactNode;
}) {
  const colours = {
    info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200",
    warning:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200",
    error:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200",
  }[tone];
  return (
    <div className={`flex items-start gap-2 rounded-md border p-3 ${colours}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-sm">
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-xs">{body}</div>
      </div>
    </div>
  );
}
