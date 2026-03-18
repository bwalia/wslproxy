"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { useOne, useList, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import NginxServerTab from "@/components/servers/NginxServerTab";
import VarnishTab from "@/components/servers/VarnishTab";
import ServerRulesTab from "@/components/servers/ServerRulesTab";
import WafProtectionTab from "@/components/servers/WafProtectionTab";
import VersionHistoryTab from "@/components/servers/VersionHistoryTab";
import type { Server as ServerType, WafPolicy, Rule } from "@/types";
import type { ServerFormState, VarnishConfig, VarnishSnippet } from "@/components/servers/types";
import type { LocationEntry } from "@/components/servers/sections/LocationBlockEditor";
import { cn } from "@/lib/utils/cn";

/* ── Defaults ─────────────────────────────────────────────────────────── */

const DEFAULT_FORM: ServerFormState = {
  server_name: "",
  proxy_server_name: "",
  profile_id: "",
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

  rules: [],
  match_cases: [],
};

/* ── Tab definitions ──────────────────────────────────────────────────── */

type TabKey = "nginx" | "varnish" | "rules" | "waf" | "history";

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
];

/* ── Hydrate helper ───────────────────────────────────────────────────── */

function hydrateForm(data: ServerType): ServerFormState {
  const vc = (data as Record<string, unknown>).varnish_config as Partial<VarnishConfig> | undefined;
  const vs = (data as Record<string, unknown>).varnish_snippets as VarnishSnippet[] | undefined;
  const vvcl = (data as Record<string, unknown>).varnish_vcl_config as string | undefined;

  return {
    server_name: data.server_name ?? "",
    proxy_server_name: data.proxy_server_name ?? "",
    profile_id: data.profile_id ?? "",
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
    cache_bypass_auth: (data as Record<string, unknown>).cache_bypass_auth as boolean ?? true,
    cache_bypass_cookie: data.cache_bypass_cookie ?? "",
    cached_mime_types: Array.isArray(data.cached_mime_types) ? data.cached_mime_types : [],

    waf_enabled: data.waf_enabled ?? false,
    waf_policy_id: data.waf_policy_id ?? "",
    waf_mode_override: data.waf_mode_override ?? "",

    rate_limit_enabled: data.rate_limit_enabled ?? false,
    rate_limit: {
      requests_per_second: data.rate_limit_requests ?? 100,
      burst: (data as Record<string, unknown>).rate_limit_burst as number ?? 50,
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

    rules: data.rules ? (typeof data.rules === "string" ? data.rules.split(",").filter(Boolean) : data.rules as unknown as string[]) : [],
    match_cases: (Array.isArray(data.match_cases) ? data.match_cases : []).map((mc) => ({
      condition: mc.condition ?? "",
      statement: Array.isArray(mc.statement) ? mc.statement : typeof mc.statement === "string" ? [mc.statement] : [],
    })),
  };
}

/* ── Build save payload ───────────────────────────────────────────────── */

function buildPayload(form: ServerFormState): Record<string, unknown> {
  return {
    server_name: form.server_name,
    proxy_server_name: form.proxy_server_name,
    profile_id: form.profile_id,
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
    rules: form.rules,
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

  const id = params.id as string;
  const isCreate = id === "create";

  /* ── Remote data ─────────────────────────────────────────────────── */

  const { data, isLoading } = useOne<ServerType>(
    isCreate ? null : "servers",
    isCreate ? null : id,
  );

  const { data: profiles } = useList<{ id: string; name: string }>("profiles");
  const { data: wafPolicies, isLoading: wafPoliciesLoading } = useList<WafPolicy>("waf_policies");
  const { data: rulesData } = useList<Rule>("rules");

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

  /* ── Hydrate from API ────────────────────────────────────────────── */

  useEffect(() => {
    if (data) {
      setForm(hydrateForm(data));
    }
  }, [data]);

  /* ── Handlers ────────────────────────────────────────────────────── */

  const handleSubmit = useCallback(async () => {
    if (!form.server_name.trim()) {
      notify("Server name is required", { type: "error" });
      setActiveTab("nginx");
      return;
    }
    if (!form.profile_id.trim()) {
      notify("Profile is required", { type: "error" });
      setActiveTab("nginx");
      return;
    }
    if (form.ssl_enabled && !form.ssl_email.trim()) {
      notify("SSL email is required when SSL is enabled", { type: "error" });
      setActiveTab("nginx");
      return;
    }

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
      router.push("/servers");
    } catch (err) {
      notify((err as Error).message || "Failed to save server", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

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

  /* ── Loading skeleton ────────────────────────────────────────────── */

  if (!isCreate && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="rectangular" className="h-12" />
        <Skeleton variant="rectangular" className="h-96" />
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div>
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <PageHeader
        title={isCreate ? "Create Server" : `Server: ${data?.server_name ?? id}`}
        subtitle={isCreate ? "Configure a new nginx server block" : "Edit server configuration"}
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
            {!isCreate && (
              <Button
                variant="danger"
                onClick={() => setShowDelete(true)}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              loading={saving}
              icon={<Save className="h-4 w-4" />}
            >
              {isCreate ? "Create" : "Save Changes"}
            </Button>
          </div>
        }
      />

      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex gap-x-1 overflow-x-auto" aria-label="Server configuration tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
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
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === "nginx" && (
        <NginxServerTab
          form={form}
          setForm={setForm}
          isCreate={isCreate}
          profileOptions={profileOptions}
          wafPolicyOptions={wafPolicyOptions}
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

      {/* ── Bottom Action Bar ────────────────────────────────────────── */}
      {activeTab !== "history" && (
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-6">
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
