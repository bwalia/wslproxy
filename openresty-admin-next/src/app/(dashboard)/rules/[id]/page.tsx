"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Save,
  Trash2,
  GitBranch,
  Plus,
  X,
  Network,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useOne, useList, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import Badge from "@/components/ui/Badge";
import type { Rule, Backend } from "@/types";
import {
  runValidationGate,
  useSubmitGuard,
  useScrollToFirstFieldError,
} from "@/lib/forms";
import { ruleInputSchema } from "@/lib/validation/input-schemas";

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

// ── Country list ────────────────────────────────────────────────────────

const COUNTRIES = [
  { value: "", label: "— None —" },
  { value: "EU", label: "EU (All European Countries)" },
  { value: "AF", label: "Afghanistan" }, { value: "AL", label: "Albania" },
  { value: "DZ", label: "Algeria" }, { value: "AR", label: "Argentina" },
  { value: "AU", label: "Australia" }, { value: "AT", label: "Austria" },
  { value: "BD", label: "Bangladesh" }, { value: "BE", label: "Belgium" },
  { value: "BR", label: "Brazil" }, { value: "BG", label: "Bulgaria" },
  { value: "CA", label: "Canada" }, { value: "CL", label: "Chile" },
  { value: "CN", label: "China" }, { value: "CO", label: "Colombia" },
  { value: "HR", label: "Croatia" }, { value: "CZ", label: "Czech Republic" },
  { value: "DK", label: "Denmark" }, { value: "EG", label: "Egypt" },
  { value: "FI", label: "Finland" }, { value: "FR", label: "France" },
  { value: "DE", label: "Germany" }, { value: "GR", label: "Greece" },
  { value: "HK", label: "Hong Kong" }, { value: "HU", label: "Hungary" },
  { value: "IN", label: "India" }, { value: "ID", label: "Indonesia" },
  { value: "IR", label: "Iran" }, { value: "IQ", label: "Iraq" },
  { value: "IE", label: "Ireland" }, { value: "IL", label: "Israel" },
  { value: "IT", label: "Italy" }, { value: "JP", label: "Japan" },
  { value: "KE", label: "Kenya" }, { value: "KR", label: "South Korea" },
  { value: "MY", label: "Malaysia" }, { value: "MX", label: "Mexico" },
  { value: "NL", label: "Netherlands" }, { value: "NZ", label: "New Zealand" },
  { value: "NG", label: "Nigeria" }, { value: "NO", label: "Norway" },
  { value: "PK", label: "Pakistan" }, { value: "PE", label: "Peru" },
  { value: "PH", label: "Philippines" }, { value: "PL", label: "Poland" },
  { value: "PT", label: "Portugal" }, { value: "RO", label: "Romania" },
  { value: "RU", label: "Russia" }, { value: "SA", label: "Saudi Arabia" },
  { value: "SG", label: "Singapore" }, { value: "ZA", label: "South Africa" },
  { value: "ES", label: "Spain" }, { value: "SE", label: "Sweden" },
  { value: "CH", label: "Switzerland" }, { value: "TW", label: "Taiwan" },
  { value: "TH", label: "Thailand" }, { value: "TR", label: "Turkey" },
  { value: "UA", label: "Ukraine" }, { value: "AE", label: "UAE" },
  { value: "GB", label: "United Kingdom" }, { value: "US", label: "United States" },
  { value: "VN", label: "Vietnam" },
];

// ── Form state type ─────────────────────────────────────────────────────

interface RuleForm {
  name: string;
  profile_id: string;
  priority: number;
  version: number;
  // Match rules
  path: string;
  path_key: string;
  country: string;
  country_key: string;
  client_ip: string;
  client_ip_key: string;
  jwt_token_validation: string;
  jwt_token_validation_value: string;
  jwt_token_validation_key: string;
  amazon_s3_region: string;
  amazon_s3_access_key: string;
  amazon_s3_secret_key: string;
  // Tags
  rules_tags: string[];
  // Response
  allow: boolean;
  code: number;
  redirect_uri: string;
  message: string;
  strip_path: boolean;
  auto_redirect_https: boolean;
  is_consul: boolean;
  consul_domain_name: string;
  // Traffic splitting (code 305)
  routing_mode: string;
  routing_header_name: string;
  routing_header_value: string;
  routing_cookie_name: string;
  routing_sticky: boolean;
  backends: Backend[];
}

const DEFAULT_FORM: RuleForm = {
  name: "",
  profile_id: "",
  priority: 1,
  version: 1,
  path: "/",
  path_key: "starts_with",
  country: "",
  country_key: "equals",
  client_ip: "",
  client_ip_key: "equals",
  jwt_token_validation: "equals",
  jwt_token_validation_value: "",
  jwt_token_validation_key: "",
  amazon_s3_region: "eu-west-2",
  amazon_s3_access_key: "",
  amazon_s3_secret_key: "",
  rules_tags: [],
  allow: false,
  code: 403,
  redirect_uri: "",
  message: "",
  strip_path: false,
  auto_redirect_https: false,
  is_consul: false,
  consul_domain_name: "",
  routing_mode: "weighted",
  routing_header_name: "X-Canary",
  routing_header_value: "true",
  routing_cookie_name: "canary_session",
  routing_sticky: false,
  backends: [],
};

// ── Helper: decode base64 safely ────────────────────────────────────────

function safeBase64Decode(str: string): string {
  if (!str) return "";
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    try { return atob(str); } catch { return str; }
  }
}

function safeBase64Encode(str: string): string {
  if (!str) return "";
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

// ── Section heading component ───────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="col-span-full mt-2 mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {children}
    </p>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      {label}
    </label>
  );
}

// ── Main page component ─────────────────────────────────────────────────

export default function RuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const api = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  /* ── Clone mode ──────────────────────────────────────────────────────
     `/rules/create?source=<id>` loads an existing rule and pre-fills
     this form, suffixing the name with `-clone` so an unedited Save
     creates a new rule instead of editing the source.  The backend
     generates a fresh uuid on POST. */
  const searchParams = useSearchParams();
  const sourceId = isCreate ? searchParams?.get("source") ?? null : null;
  const isClone = isCreate && Boolean(sourceId);
  const fetchKey = isCreate ? sourceId : id;

  const { data, isLoading } = useOne<Rule>(
    fetchKey ? "rules" : null,
    fetchKey,
  );

  // Fetch profiles for the dropdown
  const { data: profiles } = useList<{ id: string; name: string }>("profiles");
  const profileOptions = useMemo(
    () =>
      (profiles ?? []).map((p) => ({ value: p.id ?? p.name, label: p.name })),
    [profiles],
  );

  const [form, setForm] = useState<RuleForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [showTopology, setShowTopology] = useState(false);
  // Per-field validation errors surfaced from `runValidationGate`.
  // Populated in handleSubmit; cleared per-field as the user edits
  // the offending input via the `set` helper below.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Hydrate form from fetched data
  useEffect(() => {
    if (!data) return;
    const m = data.match?.rules ?? {};
    const r = data.match?.response ?? {};
    const rt = r.routing ?? {};
    // On clone, suffix the unique identifier so the user spots that
    // it's a copy and an accidental Save doesn't collide with the
    // source.  Version resets to 1 — a clone's own change history
    // starts fresh.
    const baseName = data.name ?? "";
    const initialName = isClone ? `${baseName}-clone` : baseName;
    const initialVersion = isClone ? 1 : data.version ?? 1;
    setForm({
      name: initialName,
      profile_id: data.profile_id ?? "",
      priority: data.priority ?? 1,
      version: initialVersion,
      path: m.path ?? "/",
      path_key: m.path_key ?? "starts_with",
      country: m.country ?? "",
      country_key: m.country_key ?? "equals",
      client_ip: m.client_ip ?? "",
      client_ip_key: m.client_ip_key ?? "equals",
      jwt_token_validation: m.jwt_token_validation ?? "equals",
      jwt_token_validation_value: m.jwt_token_validation_value ?? "",
      jwt_token_validation_key: m.jwt_token_validation_key ?? "",
      amazon_s3_region: m.amazon_s3_region ?? "eu-west-2",
      amazon_s3_access_key: m.amazon_s3_access_key ?? "",
      amazon_s3_secret_key: m.amazon_s3_secret_key ?? "",
      allow: r.allow ?? false,
      code: r.code ?? 403,
      redirect_uri: r.redirect_uri ?? "",
      message: safeBase64Decode(r.message ?? ""),
      strip_path: r.strip_path ?? false,
      auto_redirect_https: r.auto_redirect_https ?? false,
      is_consul: r.is_consul ?? false,
      consul_domain_name: r.consul_domain_name ?? "",
      routing_mode: rt.mode ?? "weighted",
      routing_header_name: rt.header_name ?? "X-Canary",
      routing_header_value: rt.header_value ?? "true",
      routing_cookie_name: rt.cookie_name ?? "canary_session",
      routing_sticky: rt.sticky ?? false,
      backends: Array.isArray(r.backends) ? r.backends : Array.isArray((rt as Record<string, unknown>).backends) ? (rt as { backends: Backend[] }).backends : [],
      rules_tags: Array.isArray(data.rules_tags) ? data.rules_tags : [],
    });
  }, [data, isClone]);

  const set = useCallback(
    <K extends keyof RuleForm>(field: K, value: RuleForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear that field's validation error as the user edits — and
      // any nested error path under it (e.g. `backends.0.address`
      // when the user edits the `backends` array).
      setFieldErrors((prev) => {
        const fieldStr = String(field);
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (k !== fieldStr && !k.startsWith(fieldStr + ".")) next[k] = v;
        }
        return next;
      });
    },
    [],
  );

  // ── Tag helpers ────────────────────────────────────────────────────
  const addTag = useCallback(() => {
    const tag = newTag.trim();
    if (tag && !form.rules_tags.includes(tag)) {
      set("rules_tags", [...form.rules_tags, tag]);
    }
    setNewTag("");
  }, [newTag, form.rules_tags, set]);

  const removeTag = useCallback((idx: number) => {
    set("rules_tags", form.rules_tags.filter((_, i) => i !== idx));
  }, [form.rules_tags, set]);

  // ── Conditional visibility ──────────────────────────────────────────

  const showRedirectUri = useMemo(
    () => [301, 302, 305].includes(form.code),
    [form.code],
  );
  const showMessage = useMemo(
    () => [200, 403].includes(form.code),
    [form.code],
  );
  const showTrafficSplit = useMemo(() => form.code === 305, [form.code]);
  const isS3 = form.jwt_token_validation === "amazon_s3_signed_header_validation";
  const showTokenFields = !!form.jwt_token_validation_value;
  const showS3Fields = isS3 && !!form.jwt_token_validation_key;

  const redirectLabel = useMemo(() => {
    if (form.code === 305) return "Proxy Pass URL";
    if (form.code === 301 || form.code === 302) return "Redirect URL";
    return "Target URL";
  }, [form.code]);

  // ── Build payload ───────────────────────────────────────────────────

  const buildPayload = useCallback(() => {
    const payload: Record<string, unknown> = {
      name: form.name,
      profile_id: form.profile_id,
      priority: form.priority,
      version: form.version,
      rules_tags: form.rules_tags,
      match: {
        rules: {
          path: form.path || "/",
          path_key: form.path_key,
          ...(form.country && { country: form.country, country_key: form.country_key }),
          ...(form.client_ip && { client_ip: form.client_ip, client_ip_key: form.client_ip_key }),
          jwt_token_validation: form.jwt_token_validation,
          ...(form.jwt_token_validation_value && {
            jwt_token_validation_value: form.jwt_token_validation_value,
            jwt_token_validation_key: form.jwt_token_validation_key,
          }),
          ...(isS3 && {
            amazon_s3_region: form.amazon_s3_region,
            amazon_s3_access_key: form.amazon_s3_access_key,
            amazon_s3_secret_key: form.amazon_s3_secret_key,
          }),
        },
        response: {
          allow: form.allow,
          code: form.code,
          ...(showRedirectUri && { redirect_uri: form.redirect_uri }),
          ...(showMessage && { message: safeBase64Encode(form.message) }),
          strip_path: form.strip_path,
          auto_redirect_https: form.auto_redirect_https,
          is_consul: form.is_consul,
          ...(form.is_consul && { consul_domain_name: form.consul_domain_name }),
          ...(showTrafficSplit && {
            routing: {
              mode: form.routing_mode,
              ...(form.routing_mode === "header" && {
                header_name: form.routing_header_name,
                header_value: form.routing_header_value,
              }),
              ...(form.routing_mode === "cookie" && {
                cookie_name: form.routing_cookie_name,
                sticky: form.routing_sticky,
              }),
            },
            backends: form.backends,
          }),
        },
      },
    };
    return payload;
  }, [form, isS3, showRedirectUri, showMessage, showTrafficSplit]);

  // ── Submit ──────────────────────────────────────────────────────────

  // Synchronous duplicate-submit guard (Wave 11.5).  The
  // `loading={saving}` button state is one render behind, so a fast
  // double-click can fire two POSTs before the disable paints.
  const guardSubmit = useSubmitGuard();

  // Imperative scroll-to-error — only fires on submit, never on
  // per-keystroke error clearing, so the cursor stays where the user
  // is typing.
  const scrollToFirstError = useScrollToFirstFieldError();

  const handleSubmit = useCallback(guardSubmit(async () => {
    // Structured Zod validation — replaces the single ad-hoc name check.
    // Covers priority, path / IP format, 301/302 redirect_uri, and 305
    // backend requirements before we send a half-formed rule to the
    // backend.
    const gate = runValidationGate(ruleInputSchema, {
      name: form.name,
      priority: form.priority,
      code: form.code,
      path: form.path,
      path_key: form.path_key,
      client_ip: form.client_ip,
      country: form.country,
      redirect_uri: form.redirect_uri,
      backends: form.backends,
    });
    if (!gate.ok && gate.firstError) {
      // Surface every field error inline (Wave 11.6) — the toast
      // gives the headline, but the actual offending input also
      // turns red with a message below it so the user doesn't have
      // to guess which field is wrong.
      setFieldErrors(gate.fieldErrors);
      notify(gate.firstError.message, { type: "error" });
      scrollToFirstError();
      return;
    }
    // Clear any stale errors from a previous failed attempt.
    setFieldErrors({});
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isCreate) {
        await api.create("rules", payload);
        notify("Rule created successfully", { type: "success" });
      } else {
        await api.update("rules", id, payload);
        notify("Rule updated successfully", { type: "success" });
      }
      router.push("/rules");
    } catch (err) {
      notify((err as Error).message || "Failed to save rule", { type: "error" });
    } finally {
      setSaving(false);
    }
  }), [
    isCreate,
    id,
    form,
    buildPayload,
    api,
    notify,
    router,
    guardSubmit,
    scrollToFirstError,
  ]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await api.remove("rules", id);
      notify("Rule deleted", { type: "success" });
      router.push("/rules");
    } catch (err) {
      notify((err as Error).message || "Failed to delete", { type: "error" });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }, [id, api, notify, router]);

  // ── Backend array helpers ───────────────────────────────────────────

  const addBackend = useCallback(() => {
    set("backends", [...form.backends, { address: "", weight: 50, label: "stable" }]);
  }, [form.backends, set]);

  const removeBackend = useCallback(
    (idx: number) => set("backends", form.backends.filter((_, i) => i !== idx)),
    [form.backends, set],
  );

  const updateBackend = useCallback(
    (idx: number, field: keyof Backend, value: string | number) => {
      const updated = form.backends.map((b, i) =>
        i === idx ? { ...b, [field]: value } : b,
      );
      set("backends", updated);
    },
    [form.backends, set],
  );

  // ── Loading state ───────────────────────────────────────────────────

  // Show skeleton while either an edit fetch OR a clone source fetch
  // is in flight.  Pure create (no source) has fetchKey === null and
  // isLoading === false, so it falls straight through.
  if (fetchKey && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="rectangular" className="h-96" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          isClone
            ? `Clone of ${data?.name ?? "rule"}`
            : isCreate
              ? "Create Rule"
              : `Edit Rule: ${data?.name ?? id}`
        }
        icon={GitBranch}
        actions={
          <Button variant="ghost" onClick={() => router.push("/rules")} icon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
        }
      />

      {/* ── Topology (existing rules only) ──────────────────────────── */}
      {!isCreate && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setShowTopology(!showTopology)}
            className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50 rounded-xl"
          >
            <Network className="h-4 w-4 text-primary-500" />
            Topology
            {showTopology ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}
          </button>
          {showTopology && (
            <div className="border-t border-slate-200 dark:border-slate-800" style={{ height: 420 }}>
              <TopologyCanvas filterRuleId={id} compact />
            </div>
          )}
        </div>
      )}

      {/* ── Section 1: Basic Information ─────────────────────────────── */}
      <Card>
        <Card.Header>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Basic Rule Information</h2>
            <p className="text-sm text-slate-500">Configure the rule name, profile, and metadata</p>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              label="Rule Name *"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              // Validation gate's per-field errors take precedence
              // over the simple "Required" hint so the user sees the
              // exact constraint message ("must start alphanumeric"
              // etc.) when validation has run.
              error={fieldErrors.name ?? (!form.name.trim() ? "Required" : undefined)}
            />
            <Select
              label="Profile *"
              value={form.profile_id}
              onChange={(e) => set("profile_id", e.target.value)}
              options={profileOptions}
              placeholder="Select a profile"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Priority"
                type="number"
                value={String(form.priority)}
                hint={fieldErrors.priority ? undefined : "1-10000"}
                onChange={(e) => set("priority", Number(e.target.value))}
                error={fieldErrors.priority}
              />
              <Input
                label="Version"
                type="number"
                value={String(form.version)}
                onChange={(e) => set("version", Number(e.target.value))}
              />
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* ── Tags ─────────────────────────────────────────────────────── */}
      <Card>
        <Card.Body>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.rules_tags.map((tag, i) => (
                <Badge key={i} variant="primary">
                  {tag}
                  <button onClick={() => removeTag(i)} className="ml-1 hover:text-red-500">
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add a tag..." onKeyDown={(e) => e.key === 'Enter' && addTag()} />
              <Button size="sm" variant="secondary" onClick={addTag}>Add</Button>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* ── Section 2: Match Rules ───────────────────────────────────── */}
      <Card>
        <Card.Header>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Match Rules</h2>
            <p className="text-sm text-slate-500">Define conditions for when this rule should be applied</p>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* URL Path */}
            <SectionLabel>URL Path Matching</SectionLabel>
            <Select label="Match Type *" value={form.path_key} onChange={(e) => set("path_key", e.target.value)} options={[
              { value: "starts_with", label: "Starts With" },
              { value: "ends_with", label: "Ends With" },
              { value: "equals", label: "Exact Match" },
            ]} />
            <Input
              label="Path *"
              value={form.path}
              placeholder="/"
              onChange={(e) => set("path", e.target.value)}
              error={fieldErrors.path}
            />

            {/* Geographic */}
            <SectionLabel>Geographic Filtering</SectionLabel>
            <Select label="Country" value={form.country} onChange={(e) => set("country", e.target.value)} options={COUNTRIES} />
            {form.country && (
              <Select label="Country Match" value={form.country_key} onChange={(e) => set("country_key", e.target.value)} options={[
                { value: "equals", label: "Equals" },
              ]} />
            )}
            {form.country === "EU" && (
              <div className="col-span-full rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                EU includes: AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE
              </div>
            )}

            {/* Client IP */}
            <SectionLabel>Client IP Filtering</SectionLabel>
            <Input
              label="Client IP"
              value={form.client_ip}
              placeholder="e.g. 192.168.1.0/24"
              onChange={(e) => set("client_ip", e.target.value)}
              error={fieldErrors.client_ip}
              hint={
                fieldErrors.client_ip
                  ? undefined
                  : "IPv4, IPv6, CIDR, or comma-separated list"
              }
            />
            {form.client_ip && (
              <Select label="IP Match Type" value={form.client_ip_key} onChange={(e) => set("client_ip_key", e.target.value)} options={[
                { value: "equals", label: "Equals" },
                { value: "starts_with", label: "Starts With" },
                { value: "ipheader", label: "IP Header" },
              ]} />
            )}

            {/* Token Validation */}
            <SectionLabel>Token Validation</SectionLabel>
            <Select label="Validation Type" value={form.jwt_token_validation} onChange={(e) => set("jwt_token_validation", e.target.value)} options={[
              { value: "equals", label: "None" },
              { value: "cookie_jwt_token_validation", label: "Cookie JWT Token" },
              { value: "cookie_key_value", label: "Cookie Key Value" },
              { value: "header_jwt_token_validation", label: "Header JWT Token" },
              { value: "amazon_s3_signed_header_validation", label: "Amazon S3 Signed Header" },
            ]} />
            {form.jwt_token_validation !== "equals" && (
              <>
                <Input
                  label={isS3 ? "Bucket Name" : "Token Value"}
                  value={form.jwt_token_validation_value}
                  onChange={(e) => set("jwt_token_validation_value", e.target.value)}
                />
                {showTokenFields && (
                  <Input
                    label={isS3 ? "Bucket File Paths" : "Token Secret Key"}
                    type={isS3 ? "text" : "password"}
                    value={form.jwt_token_validation_key}
                    onChange={(e) => set("jwt_token_validation_key", e.target.value)}
                  />
                )}
                {showS3Fields && (
                  <>
                    <Input label="S3 Region" value={form.amazon_s3_region} onChange={(e) => set("amazon_s3_region", e.target.value)} />
                    <Input label="AWS Access Key" type="password" value={form.amazon_s3_access_key} onChange={(e) => set("amazon_s3_access_key", e.target.value)} />
                    <Input label="AWS Secret Key" type="password" value={form.amazon_s3_secret_key} onChange={(e) => set("amazon_s3_secret_key", e.target.value)} />
                  </>
                )}
              </>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── Section 3: Response Configuration ────────────────────────── */}
      <Card>
        <Card.Header>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Response Configuration</h2>
            <p className="text-sm text-slate-500">Define the response behavior when this rule matches</p>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Toggle label="Allow Request" checked={form.allow} onChange={(v) => set("allow", v)} />
            <Select label="Response Code *" value={String(form.code)} onChange={(e) => set("code", Number(e.target.value))} options={[
              { value: "200", label: "200 — Custom Response" },
              { value: "301", label: "301 — Permanent Redirect" },
              { value: "302", label: "302 — Temporary Redirect" },
              { value: "305", label: "305 — Proxy Pass / Traffic Split" },
              { value: "403", label: "403 — Forbidden" },
            ]} />

            {showRedirectUri && (
              <Input
                label={`${redirectLabel} *`}
                value={form.redirect_uri}
                placeholder="https://example.com"
                onChange={(e) => set("redirect_uri", e.target.value)}
                error={fieldErrors.redirect_uri}
              />
            )}

            <SectionLabel>Proxy Options</SectionLabel>
            <Toggle label="Strip matched path prefix before proxying" checked={form.strip_path} onChange={(v) => set("strip_path", v)} />
            <Toggle label="Auto-redirect HTTP to HTTPS" checked={form.auto_redirect_https} onChange={(v) => set("auto_redirect_https", v)} />
            <Toggle label="Consul Service Discovery" checked={form.is_consul} onChange={(v) => set("is_consul", v)} />
            {form.is_consul && (
              <Input label="Consul Domain Name *" value={form.consul_domain_name} onChange={(e) => set("consul_domain_name", e.target.value)} />
            )}

            {showMessage && (
              <>
                <SectionLabel>Response Body (HTML)</SectionLabel>
                <div className="col-span-full">
                  <Textarea
                    label="HTML Message"
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    rows={8}
                    hint="This will be Base64-encoded before saving"
                  />
                </div>
              </>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── Section 4: Traffic Splitting (code 305 only) ─────────────── */}
      {showTrafficSplit && (
        <Card>
          <Card.Header>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Traffic Splitting</h2>
              <p className="text-sm text-slate-500">Configure multi-backend routing for canary releases, A/B testing, or weighted load balancing</p>
            </div>
          </Card.Header>
          <Card.Body>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select label="Routing Mode" value={form.routing_mode} onChange={(e) => set("routing_mode", e.target.value)} options={[
                { value: "weighted", label: "Weighted Random" },
                { value: "round_robin", label: "Round Robin" },
                { value: "header", label: "Header Match" },
                { value: "cookie", label: "Cookie / Sticky" },
                { value: "least_conn", label: "Least Busy" },
              ]} />

              {form.routing_mode === "header" && (
                <>
                  <Input label="Header Name" value={form.routing_header_name} onChange={(e) => set("routing_header_name", e.target.value)} />
                  <Input label="Header Value (routes to canary)" value={form.routing_header_value} onChange={(e) => set("routing_header_value", e.target.value)} />
                </>
              )}

              {form.routing_mode === "cookie" && (
                <>
                  <Input label="Cookie Name" value={form.routing_cookie_name} onChange={(e) => set("routing_cookie_name", e.target.value)} />
                  <Toggle label="Sticky sessions (pin client to backend)" checked={form.routing_sticky} onChange={(v) => set("routing_sticky", v)} />
                </>
              )}
            </div>

            {/* Backends */}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Backends
                  {form.backends.length > 0 && (
                    <Badge variant="primary" size="sm" className="ml-2">{form.backends.length}</Badge>
                  )}
                </h3>
                <Button size="sm" variant="secondary" onClick={addBackend} icon={<Plus className="h-3.5 w-3.5" />}>
                  Add Backend
                </Button>
              </div>

              {/* Section-level validation error.  The schema's
                  refine() puts the message at path "backends" — when
                  set, the missing-backends or empty-address message
                  shows above the list so the user can see it without
                  scrolling per-row. */}
              {fieldErrors.backends && (
                <div
                  role="alert"
                  className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                >
                  {fieldErrors.backends}
                </div>
              )}

              {form.backends.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  No backends configured. Add at least one backend for traffic splitting.
                </p>
              )}

              <div className="space-y-3">
                {form.backends.map((backend, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                      <Input
                        label="Address (host:port)"
                        value={backend.address}
                        placeholder="10.0.0.1:8080"
                        onChange={(e) => updateBackend(idx, "address", e.target.value)}
                      />
                      <Input
                        label="Weight (0-100)"
                        type="number"
                        value={String(backend.weight)}
                        onChange={(e) => updateBackend(idx, "weight", Number(e.target.value))}
                      />
                      <Input
                        label="Label"
                        value={backend.label}
                        placeholder="stable / canary"
                        onChange={(e) => updateBackend(idx, "label", e.target.value)}
                      />
                    </div>
                    <button
                      onClick={() => removeBackend(idx)}
                      className="mt-6 rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      title="Remove backend"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* ── Action bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          {!isCreate && (
            <Button variant="danger" onClick={() => setShowDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
              Delete Rule
            </Button>
          )}
        </div>
        <Button onClick={handleSubmit} loading={saving} icon={<Save className="h-4 w-4" />}>
          {isClone ? "Save as new rule" : isCreate ? "Create Rule" : "Save Changes"}
        </Button>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Rule"
        message={`Are you sure you want to delete "${data?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
