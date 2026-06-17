"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Save,
  Trash2,
  Server,
  Globe,
  Database,
  ListFilter,
  Shield,
  History,
  Network,
  Bookmark,
} from "lucide-react";
import { useOne, useList, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import { useProfile } from "@/contexts/ProfileContext";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import FetchErrorState from "@/components/ui/FetchErrorState";
import NginxServerTab from "@/components/servers/NginxServerTab";
import CachePurgeButton from "@/components/servers/CachePurgeButton";
import BookmarkFromServerDialog from "@/components/servers/BookmarkFromServerDialog";

// Deferred — heavy tabs only loaded when first opened
const VarnishTab = dynamic(() => import("@/components/servers/VarnishTab"), {
  loading: () => <Skeleton variant="rectangular" className="h-64 w-full" />,
});
const ServerRulesTab = dynamic(
  () => import("@/components/servers/ServerRulesTab"),
  { loading: () => <Skeleton variant="rectangular" className="h-64 w-full" /> },
);
const WafProtectionTab = dynamic(
  () => import("@/components/servers/WafProtectionTab"),
  { loading: () => <Skeleton variant="rectangular" className="h-64 w-full" /> },
);
const VersionHistoryTab = dynamic(
  () => import("@/components/servers/VersionHistoryTab"),
  { loading: () => <Skeleton variant="rectangular" className="h-64 w-full" /> },
);
const TopologyCanvas = dynamic(
  () =>
    import("@/components/topology/TopologyCanvas").then(
      (mod) => mod.TopologyCanvas,
    ),
  {
    loading: () => <Skeleton variant="rectangular" className="h-96 w-full" />,
    ssr: false,
  },
);
import type { Server as ServerType, WafPolicy, Rule, Pop } from "@/types";
import type { ServerFormState, VarnishConfig, VarnishSnippet } from "@/components/servers/types";
import type { LocationEntry } from "@/components/servers/sections/LocationBlockEditor";
import {
  runValidationGate,
  findTabForError,
  useSubmitGuard,
  useScrollToFirstFieldError,
} from "@/lib/forms";
import { serverInputSchema } from "@/lib/validation/input-schemas";
import { cn } from "@/lib/utils/cn";

/* ── Defaults ─────────────────────────────────────────────────────────── */

const DEFAULT_FORM: ServerFormState = {
  server_name: "",
  proxy_server_name: "",
  profile_id: "",
  pop_ids: [],
  servers_tags: [],
  root: "/var/www/html",
  index: "index.html",
  access_log: "logs/access.log",
  error_log: "logs/error.log",

  listens: [{ listen: "80" }],

  ssl_enabled: false,
  ssl_email: "",
  ssl_auto_renew: true,
  ssl_force_https: true,
  ssl_staging: true,

  cache_enabled: false,
  cache_ttl: 3600,
  cache_bypass_auth: true,
  cache_bypass_cookie: "",
  cached_mime_types: [],

  waf_enabled: false,
  waf_policy_id: "",
  waf_mode_override: "",

  rate_limit_enabled: false,
  rate_limit: { requests_per_second: 100, burst: 50 },

  custom_headers: [],
  custom_response_headers: [],

  locations: [],

  custom_block: [],
  custom_location_block: [],
  custom_http_block: [],

  config: "",

  varnish_enabled: false,
  varnish_config: {
    listen_address: "0.0.0.0",
    listen_port: "6081",
    admin_listen_port: "6082",
    cache_ttl_default: 120,
    cache_grace: 3600,
    cache_keep: 7200,
    cache_size: "256m",
    backend_connect_timeout: 5,
    backend_first_byte_timeout: 60,
    backend_between_bytes_timeout: 10,
    health_check_enabled: false,
    health_check_url: "/health",
    health_check_interval: 5,
    health_check_timeout: 2,
  },
  varnish_snippets: [],
  varnish_vcl_config: "",

  rules: "",
  match_cases: [],
};

/* ── Tab definitions ──────────────────────────────────────────────────── */

type TabKey = "nginx" | "varnish" | "rules" | "waf" | "history" | "topology";

/**
 * Which tab owns each top-level field — used to auto-jump to the tab
 * containing a validation error.  Order matters: the first matching
 * prefix wins.  Anything not listed falls back to the Nginx tab.
 */
const FIELD_TO_TAB: Array<{ prefix: string; tab: TabKey }> = [
  { prefix: "varnish_enabled", tab: "varnish" },
  { prefix: "varnish_config", tab: "varnish" },
  { prefix: "varnish_snippets", tab: "varnish" },
  { prefix: "varnish_vcl_config", tab: "varnish" },
  { prefix: "waf_enabled", tab: "waf" },
  { prefix: "waf_policy_id", tab: "waf" },
  { prefix: "waf_mode_override", tab: "waf" },
  { prefix: "rules", tab: "rules" },
  { prefix: "match_cases", tab: "rules" },
];

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { key: "nginx", label: "Nginx Server", icon: Globe },
  { key: "varnish", label: "Varnish", icon: Database },
  { key: "rules", label: "Server Rules", icon: ListFilter },
  { key: "waf", label: "WAF Protection", icon: Shield },
  { key: "history", label: "Version History", icon: History },
  { key: "topology", label: "Topology", icon: Network },
];

/* ── Hydrate helper ───────────────────────────────────────────────────── */

function hydrateForm(data: ServerType): ServerFormState {
  const vc = (data as unknown as Record<string, unknown>).varnish_config as Partial<VarnishConfig> | undefined;
  const vs = (data as unknown as Record<string, unknown>).varnish_snippets as VarnishSnippet[] | undefined;
  const vvcl = (data as unknown as Record<string, unknown>).varnish_vcl_config as string | undefined;

  return {
    server_name: data.server_name ?? "",
    proxy_server_name: data.proxy_server_name ?? "",
    profile_id: data.profile_id ?? "",
    pop_ids: Array.isArray(data.pop_ids) ? data.pop_ids : [],
    servers_tags: Array.isArray(data.servers_tags) ? data.servers_tags : [],
    root: data.root ?? "/var/www/html",
    index: data.index ?? "index.html",
    access_log: data.access_log ?? "logs/access.log",
    error_log: data.error_log ?? "logs/error.log",

    listens: Array.isArray(data.listens) ? data.listens.map((l) => ({ listen: String(l.listen ?? "") })) : [{ listen: "80" }],

    ssl_enabled: data.ssl_enabled ?? false,
    ssl_email: data.ssl_email ?? "",
    ssl_auto_renew: data.ssl_auto_renew ?? true,
    ssl_force_https: data.ssl_force_https ?? true,
    ssl_staging: data.ssl_staging ?? true,

    cache_enabled: data.cache_enabled ?? false,
    cache_ttl: data.cache_ttl ?? 3600,
    cache_bypass_auth: (data as unknown as Record<string, unknown>).cache_bypass_auth as boolean ?? true,
    cache_bypass_cookie: data.cache_bypass_cookie ?? "",
    cached_mime_types: Array.isArray(data.cached_mime_types) ? data.cached_mime_types : [],

    waf_enabled: data.waf_enabled ?? false,
    waf_policy_id: data.waf_policy_id ?? "",
    waf_mode_override: data.waf_mode_override ?? "",

    rate_limit_enabled: data.rate_limit_enabled ?? false,
    rate_limit: {
      requests_per_second: data.rate_limit_requests ?? 100,
      burst: (data as unknown as Record<string, unknown>).rate_limit_burst as number ?? 50,
    },

    custom_headers: Array.isArray(data.custom_headers) ? data.custom_headers : [],
    custom_response_headers: Array.isArray(data.custom_response_headers) ? data.custom_response_headers : [],

    locations: Array.isArray(data.locations)
      ? data.locations.map((l) => ({
          location_path: l.location_path ?? "/",
          location_opts: l.location_opts ?? {},
          location_vals: l.location_vals ?? {},
        }))
      : [],

    custom_block: Array.isArray(data.custom_block) ? data.custom_block : [],
    custom_location_block: Array.isArray(data.custom_location_block) ? data.custom_location_block : [],
    custom_http_block: Array.isArray(data.custom_http_block) ? data.custom_http_block : [],

    config: data.config ?? "",

    varnish_enabled: data.varnish_enabled ?? false,
    varnish_config: { ...DEFAULT_FORM.varnish_config, ...vc },
    varnish_snippets: Array.isArray(vs) ? vs : [],
    varnish_vcl_config: vvcl ?? "",

    // Persisted as array for legacy compatibility — UI uses one id.
    rules: Array.isArray(data.rules)
      ? (data.rules[0] ?? "")
      : typeof data.rules === "string"
        ? data.rules
        : "",
    match_cases: (Array.isArray(data.match_cases) ? data.match_cases : []).map((mc) => ({
      condition: mc.condition ?? "",
      // Backend stores a single rule_id as `statement`.  Older records
      // may have been serialized as a single-element array; flatten.
      statement:
        typeof mc.statement === "string"
          ? mc.statement
          : Array.isArray(mc.statement)
            ? (mc.statement[0] ?? "")
            : "",
    })),
  };
}

/* ── Build save payload ───────────────────────────────────────────────── */

function buildPayload(form: ServerFormState): Record<string, unknown> {
  return {
    server_name: form.server_name,
    proxy_server_name: form.proxy_server_name,
    profile_id: form.profile_id,
    pop_ids: form.pop_ids,
    servers_tags: form.servers_tags,
    root: form.root,
    index: form.index,
    access_log: form.access_log,
    error_log: form.error_log,
    listens: form.listens,
    ssl_enabled: form.ssl_enabled,
    ssl_email: form.ssl_email,
    ssl_auto_renew: form.ssl_auto_renew,
    ssl_force_https: form.ssl_force_https,
    ssl_staging: form.ssl_staging,
    cache_enabled: form.cache_enabled,
    cache_ttl: form.cache_ttl,
    cache_bypass_auth: form.cache_bypass_auth,
    cache_bypass_cookie: form.cache_bypass_cookie,
    cached_mime_types: form.cached_mime_types,
    waf_enabled: form.waf_enabled,
    waf_policy_id: form.waf_policy_id,
    waf_mode_override: form.waf_mode_override,
    rate_limit_enabled: form.rate_limit_enabled,
    rate_limit: form.rate_limit,
    custom_headers: form.custom_headers,
    custom_response_headers: form.custom_response_headers,
    locations: form.locations,
    custom_block: form.custom_block,
    custom_location_block: form.custom_location_block,
    custom_http_block: form.custom_http_block,
    varnish_enabled: form.varnish_enabled,
    varnish_config: form.varnish_config,
    varnish_snippets: form.varnish_snippets,
    varnish_vcl_config: form.varnish_vcl_config,
    // Send array to preserve the legacy on-disk shape — Lua
    // `parse_rule_ids` accepts both, but existing records are arrays.
    rules: form.rules ? [form.rules] : [],
    match_cases: form.match_cases,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Main Page Component
   ══════════════════════════════════════════════════════════════════════════ */

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const { setProfile } = useProfile();

  const id = params.id as string;
  const isCreate = id === "create";

  /* ── Clone mode ──────────────────────────────────────────────────────
     When the create route carries `?source=<id>`, we're cloning an
     existing server: fetch the source record, hydrate the form with
     it, and suffix `server_name` with `-clone` so an unedited Save
     creates a new file at `host:<name>-clone.json` instead of
     overwriting the original. */
  const searchParams = useSearchParams();
  const sourceId = isCreate ? searchParams?.get("source") ?? null : null;
  const isClone = isCreate && Boolean(sourceId);
  // Single fetch key — populated for both edit and clone paths.  When
  // it's null (pure create) `useOne` is a no-op and returns null data.
  const fetchKey = isCreate ? sourceId : id;

  /* ── Remote data ─────────────────────────────────────────────────── */

  const { data, isLoading, error, mutate } = useOne<ServerType>(
    fetchKey ? "servers" : null,
    fetchKey,
  );

  const { data: profiles } = useList<{ id: string; name: string }>("profiles");
  const { data: wafPolicies, isLoading: wafPoliciesLoading } = useList<WafPolicy>("waf_policies");
  const { data: rulesData } = useList<Rule>("rules");
  // POPs feed the PopMultiSelect picker.  Fetched once and passed
  // straight through — the picker handles its own filtering /
  // grouping / status rendering.  perPage:500 because there's no
  // realistic fleet that won't fit comfortably; capping smaller
  // would silently truncate.
  const { data: popsData, isLoading: popsLoading } = useList<Pop>("pops", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "id", order: "ASC" },
  });

  /* ── Derived option lists ────────────────────────────────────────── */

  const profileOptions = useMemo(
    () => (profiles ?? []).map((p) => ({ value: p.id ?? p.name, label: p.name })),
    [profiles],
  );

  const wafPolicyOptions = useMemo(
    () =>
      (wafPolicies ?? []).map((p) => ({
        value: p.id,
        label: `${p.name}${p.mode ? ` (${p.mode})` : ""}`,
      })),
    [wafPolicies],
  );

  const ruleOptions = useMemo(
    () => (rulesData ?? []).map((r) => ({ value: r.id ?? r.name, label: r.name })),
    [rulesData],
  );

  /* ── Form state ──────────────────────────────────────────────────── */

  const [form, setForm] = useState<ServerFormState>(DEFAULT_FORM);
  const [activeTab, setActiveTab] = useState<TabKey>("nginx");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showBookmark, setShowBookmark] = useState(false);
  // Per-field validation errors from the validation gate, surfaced
  // inline on each input + as red dots on the relevant tab buttons.
  // Cleared on successful submit and on the next setForm so the user
  // sees errors disappear as they fix them.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* ── Hydrate from API ────────────────────────────────────────────── */

  useEffect(() => {
    if (!data) return;
    const hydrated = hydrateForm(data);
    if (isClone) {
      // Suffix the unique identifier so a click-Save doesn't overwrite
      // the source.  The user can rename to something meaningful before
      // saving.  The matching id `host:<server_name>` is regenerated by
      // the backend from server_name on POST.
      hydrated.server_name = `${hydrated.server_name}-clone`;
    }
    setForm(hydrated);
  }, [data, isClone]);

  // Reset the active tab when the record changes.  `/servers/create`
  // is the same path segment regardless of `?source=`, so the page
  // component is NOT remounted between two consecutive clones — which
  // means `activeTab` would otherwise persist.  If the user had
  // switched to `history` or `topology` on a previous record, the
  // bottom Save bar (line ~654) would stay hidden on the next one and
  // the page would appear to have no save button.
  useEffect(() => {
    setActiveTab("nginx");
    setFieldErrors({});
  }, [fetchKey, isCreate]);

  /* ── Handlers ────────────────────────────────────────────────────── */

  // Guard against duplicate submits on rapid clicks while the
  // request is in flight (Wave 11.5).  Disabled-button state has a
  // one-render lag; this ref-based guard is synchronous.
  const guardSubmit = useSubmitGuard();

  // Imperative scroll-to-error — fires only when `handleSubmit`
  // explicitly calls it, never on per-keystroke error clearing, so
  // the cursor stays put while the user is typing.  The two RAFs
  // inside the hook give React time to commit the new fieldErrors
  // state AND mount the new active tab before we query the DOM.
  const scrollToFirstError = useScrollToFirstFieldError();

  const handleSubmit = useCallback(guardSubmit(async () => {
    // Structured submit-time validation via the shared Zod schema.
    // Mirrors what the Lua backend enforces + what the old react-admin
    // Form.jsx checked, so the user sees a precise error before the
    // PUT round-trip.
    const gate = runValidationGate(serverInputSchema, form);
    if (!gate.ok && gate.firstError) {
      // Surface every field error inline (Wave 11.6) so the user
      // sees the offending input(s) highlighted in red, plus a red
      // dot on every tab that has errors.  The toast gives the
      // headline; the tab-jump moves them to the first issue and
      // the scroll lands them on the exact input.
      setFieldErrors(gate.fieldErrors);
      notify(gate.firstError.message, { type: "error" });
      setActiveTab(findTabForError(gate.firstError.field, FIELD_TO_TAB, "nginx"));
      scrollToFirstError();
      return;
    }
    // Clear stale errors from a previous failed submit attempt.
    setFieldErrors({});

    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (isCreate) {
        await dataProvider.create("servers", payload);
        notify("Server created successfully", { type: "success" });
      } else {
        await dataProvider.update("servers", id, payload);
        notify("Server updated successfully", { type: "success" });
      }
      // Sync the active environment profile to the saved server's
      // profile so the list page (which filters by the active profile)
      // shows the record the user just created or updated.
      if (form.profile_id) {
        setProfile(form.profile_id);
      }
      router.push("/servers");
    } catch (err) {
      notify((err as Error).message || "Failed to save server", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }), [
    isCreate,
    form,
    id,
    dataProvider,
    notify,
    router,
    guardSubmit,
    setProfile,
    scrollToFirstError,
  ]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("servers", id);
      notify("Server deleted successfully", { type: "success" });
      router.push("/servers");
    } catch (err) {
      notify((err as Error).message || "Failed to delete server", {
        type: "error",
      });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }, [id, dataProvider, notify, router]);

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
  }, []);

  /* ── Tabs-with-errors set, derived from fieldErrors + FIELD_TO_TAB ── */

  // Used to render a red dot next to each tab name when one of its
  // fields failed validation, so the operator can see at a glance
  // which other tabs to revisit even after fixing the one they
  // landed on.
  const tabsWithErrors = useMemo(() => {
    const set = new Set<TabKey>();
    for (const path of Object.keys(fieldErrors)) {
      set.add(findTabForError(path, FIELD_TO_TAB, "nginx"));
    }
    return set;
  }, [fieldErrors]);

  /* ── Loading skeleton ────────────────────────────────────────────── */

  // Show the skeleton while we have a fetch in flight — covers both
  // "open existing server" and "clone (source is being loaded)".
  if (fetchKey && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="rectangular" className="h-12" />
        <Skeleton variant="rectangular" className="h-96" />
      </div>
    );
  }

  // Surface fetch failures explicitly — otherwise an empty form
  // would render and the user wouldn't know whether the record is
  // empty or the request just failed.
  if (fetchKey && error) {
    return <FetchErrorState error={error} onRetry={() => mutate()} />;
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div>
      {/* Sticky header wrapper.  Keeps the title row + tab bar pinned
          to the top while the (very tall) form scrolls underneath, so
          the Save button in PageHeader's actions is always one glance
          away.  The bottom Save bar can't reliably stick when it's the
          last child of its parent (sticky needs room below to anchor
          against), so we rely on this top-pinned copy instead. */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 bg-slate-50/95 px-6 pt-6 pb-2 backdrop-blur-sm dark:bg-slate-950/95">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <PageHeader
        title={
          isClone
            ? `Clone of ${data?.server_name ?? "server"}`
            : isCreate
              ? "Create Server"
              : `Server: ${data?.server_name ?? id}`
        }
        subtitle={
          isClone
            ? "Rename and tweak fields, then Save to create a new server"
            : isCreate
              ? "Configure a new nginx server block"
              : "Edit server configuration"
        }
        icon={Server}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => router.push("/servers")}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
            {/* Cache purge only meaningful for saved servers that have
                caching enabled — disabled otherwise to avoid confusion. */}
            {!isCreate && (
              <CachePurgeButton
                serverName={form.server_name}
                disabled={!form.cache_enabled || !form.server_name}
              />
            )}
            {/* Bookmark only after Save — pre-fill needs a real
                `server_name` and creating a bookmark for a record
                that doesn't exist yet would orphan it.  Hidden on
                Create / Clone for the same reason the Delete button
                is. */}
            {!isCreate && (
              <Button
                variant="ghost"
                onClick={() => setShowBookmark(true)}
                disabled={!form.server_name}
                icon={<Bookmark className="h-4 w-4" />}
                title={
                  form.server_name
                    ? `Create a bookmark for ${form.server_name}`
                    : "Save the server first to enable bookmarking"
                }
              >
                Bookmark
              </Button>
            )}
            {!isCreate && (
              <Button
                variant="danger"
                onClick={() => setShowDelete(true)}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
            )}
            {/* Header Save — same label whether the user arrived via
                Create or via Clone (both create a new record).  The
                page title says "Clone of <name>" so the user still
                knows they're working from a copy; the button just
                needs to be a clear "do the thing" action. */}
            <Button
              onClick={handleSubmit}
              loading={saving}
              icon={<Save className="h-4 w-4" />}
            >
              {isCreate ? "Create Server" : "Save Changes"}
            </Button>
          </div>
        }
      />

      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-x-1 overflow-x-auto" aria-label="Server configuration tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            const hasError = tabsWithErrors.has(tab.key);
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary-500 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300",
                )}
                aria-current={active ? "page" : undefined}
                aria-label={
                  hasError ? `${tab.label} (has validation errors)` : tab.label
                }
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {hasError && (
                  // Red dot indicates one or more fields on this tab
                  // failed the validation gate.  Disappears as the
                  // user fixes them (per-field errors clear in NginxServerTab's
                  // setForm wrapper).
                  <span
                    className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>
      </div>{/* end sticky header wrapper */}

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === "nginx" && (
        <NginxServerTab
          form={form}
          setForm={setForm}
          isCreate={isCreate}
          serverId={isCreate ? undefined : (id as string)}
          profileOptions={profileOptions}
          wafPolicyOptions={wafPolicyOptions}
          pops={popsData ?? []}
          popsLoading={popsLoading}
          fieldErrors={fieldErrors}
        />
      )}

      {activeTab === "varnish" && (
        <VarnishTab form={form} setForm={setForm} />
      )}

      {activeTab === "rules" && (
        <ServerRulesTab
          form={form}
          setForm={setForm}
          ruleOptions={ruleOptions}
        />
      )}

      {activeTab === "waf" && (
        <WafProtectionTab
          form={form}
          setForm={setForm}
          wafPolicies={wafPolicies ?? []}
          wafPoliciesLoading={wafPoliciesLoading}
        />
      )}

      {activeTab === "history" && (
        <VersionHistoryTab
          serverName={form.server_name}
          serverId={id}
        />
      )}

      {activeTab === "topology" && (
        <TopologyCanvas filterServerId={id} compact />
      )}

      {/* ── Bottom Action Bar ──────────────────────────────────────────
          Sticky so it stays visible on tall tabs (especially Nginx
          Server, which has 10 sections + a 600px config preview).
          Without `sticky bottom-0`, the bar lives at the natural end
          of the form and is far below the viewport — the user has to
          scroll thousands of pixels to find Save, and easily concludes
          the button is missing entirely. */}
      {activeTab !== "history" && activeTab !== "topology" && (
        <div className="sticky bottom-0 z-20 -mx-6 -mb-6 mt-8 flex items-center justify-between border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
          <div>
            {!isCreate && (
              <Button
                variant="danger"
                onClick={() => setShowDelete(true)}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete Server
              </Button>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            loading={saving}
            icon={<Save className="h-4 w-4" />}
          >
            {isCreate ? "Create Server" : "Save Changes"}
          </Button>
        </div>
      )}

      {/* ── Quick Bookmark Dialog ────────────────────────────────────── */}
      <BookmarkFromServerDialog
        open={showBookmark}
        onClose={() => setShowBookmark(false)}
        serverName={form.server_name ?? ""}
        profileId={form.profile_id ?? data?.profile_id}
      />

      {/* ── Delete Confirmation ──────────────────────────────────────── */}
      <ConfirmDialog
        open={showDelete}
        title="Delete Server"
        message={`Are you sure you want to delete "${data?.server_name ?? form.server_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
