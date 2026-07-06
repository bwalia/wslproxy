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
  Route,
  MapPin,
  Wifi,
  ShieldCheck,
  Settings,
  Zap,
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
import FetchErrorState from "@/components/ui/FetchErrorState";
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

// ── Subsection: a labelled group of related fields ─────────────────────
//
// Renders as a visually-distinct panel with an icon, a plain-language
// title, and a one-sentence intro explaining WHAT the fields do and
// WHY the user might configure them.  Fields inside stack in a single
// column on mobile and land in a 2-col grid on tablet and up.
//
// The intro text is deliberately different from the `hint` shown under
// each Input — the intro answers "what is this section for?" while the
// hint answers "what do I type here?".  Users lost inside the form
// asked us "what is the Match Type for?" and "what happens if I don't
// fill Client IP?".  Both are questions the section-level intro is
// meant to preempt.
function Subsection({
  title,
  intro,
  icon,
  optional,
  children,
}: {
  title: string;
  intro?: string;
  icon?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700/60 dark:bg-slate-800/30 sm:p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              aria-hidden
              className="text-slate-500 dark:text-slate-400"
            >
              {icon}
            </span>
          )}
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          {optional && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              Optional
            </span>
          )}
        </div>
        {intro && (
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {intro}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
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

  const { data, isLoading, error, mutate } = useOne<Rule>(
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

  // Reset transient UI state when the record being edited changes.
  // `/rules/create` is the same path segment regardless of `?source=`,
  // so the page component is NOT remounted between consecutive clones —
  // which means stale `showTopology`, `fieldErrors`, and `newTag` would
  // bleed across records.  Clear them explicitly on every record swap.
  useEffect(() => {
    setFieldErrors({});
    setShowTopology(false);
    setNewTag("");
  }, [fetchKey, isCreate]);

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

  // Field labels + hints adapt to the chosen validation type so the
  // operator sees field semantics that match the mode they picked.
  // Without this, "Token Value" / "Token Secret Key" was ambiguous —
  // an operator might paste their raw API key into "Token Secret Key"
  // expecting clients to send THAT, when actually the field is a JWT
  // SIGNING SECRET and clients must send JWTs signed with it.
  const validationFieldLabels = useMemo<{
    valueLabel: string;
    valueHint: string;
    keyLabel: string;
    keyHint: string;
  }>(() => {
    switch (form.jwt_token_validation) {
      case "header_jwt_token_validation":
        return {
          valueLabel: "HTTP Header Name",
          valueHint:
            "Name of the request header that carries the JWT (e.g. \"x-api-key\", \"Authorization\"). Clients must send the JWT as this header's value.",
          keyLabel: "JWT Signing Secret",
          keyHint:
            "Secret used to sign the JWT (HS256). Clients sign their tokens with this same value; wslproxy verifies the signature on each request. Treat like a password — anyone who has it can mint valid tokens.",
        };
      case "cookie_jwt_token_validation":
        return {
          valueLabel: "Cookie Name",
          valueHint:
            "Name of the cookie that carries the JWT (e.g. \"session\", \"auth_token\"). Clients must set this cookie with a JWT as its value.",
          keyLabel: "JWT Signing Secret",
          keyHint:
            "Secret used to sign the JWT (HS256). Same secret used by whoever issues the cookie. Treat like a password.",
        };
      case "cookie_key_value":
        return {
          valueLabel: "Cookie Name",
          valueHint:
            "Name of the cookie to check. wslproxy compares the cookie's value to the \"Expected Value\" below — no JWT involved, just plain string equality.",
          keyLabel: "Expected Cookie Value",
          keyHint:
            "Plain string the cookie must contain to pass. Less secure than JWT (no expiry, no per-client identity); use only for simple gating.",
        };
      case "amazon_s3_signed_header_validation":
        return {
          valueLabel: "S3 Bucket Name",
          valueHint:
            "Name of the S3 bucket this rule proxies to. wslproxy signs the outgoing request with AWS Signature V4 so S3 accepts it.",
          keyLabel: "S3 Object Path / Prefix",
          keyHint:
            "Path or prefix inside the bucket the rule should access. Combined with the AWS access/secret keys below.",
        };
      default:
        return {
          valueLabel: "Token Value",
          valueHint: "",
          keyLabel: "Token Secret Key",
          keyHint: "",
        };
    }
  }, [form.jwt_token_validation]);

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

  if (fetchKey && error) {
    return <FetchErrorState error={error} onRetry={() => mutate()} />;
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
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Match rules
            </h2>
            <p className="text-sm text-slate-500">
              When should this rule fire?  Configure one or more conditions
              below — the rule only runs when <em>every</em> condition you
              set matches the incoming request.
            </p>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">

            {/* URL path — always required */}
            <Subsection
              icon={<Route className="h-4 w-4" />}
              title="URL path"
              intro='This rule only runs when the request URL matches the pattern below.  Use "/" to match every request.'
            >
              <Select
                label="How to compare"
                value={form.path_key}
                onChange={(e) => set("path_key", e.target.value)}
                options={[
                  { value: "starts_with", label: "Starts with" },
                  { value: "ends_with", label: "Ends with" },
                  { value: "equals", label: "Exact match" },
                ]}
                hint="Choose how the URL path below is compared against the request."
              />
              <Input
                label="URL path"
                value={form.path}
                placeholder="/"
                onChange={(e) => set("path", e.target.value)}
                error={fieldErrors.path}
                hint={
                  form.path_key === "equals"
                    ? 'Only the exact path matches.  Example: "/api/health" matches "/api/health" and nothing else.'
                    : form.path_key === "ends_with"
                      ? 'URLs ending with this value match.  Example: ".jpg" matches "/photos/cat.jpg".'
                      : 'URLs starting with this value match.  Example: "/api" matches "/api", "/api/v1/users", "/api?q=…".  Use "/" to match every request.'
                }
              />
            </Subsection>

            {/* Country — optional */}
            <Subsection
              icon={<MapPin className="h-4 w-4" />}
              title="Restrict by country"
              optional
              intro="Only fire this rule for visitors from a specific country (based on their IP).  Leave the dropdown on “None” to allow every country."
            >
              <Select
                label="Country"
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                options={COUNTRIES}
              />
              <Select
                label="Match mode"
                value={form.country_key}
                onChange={(e) => set("country_key", e.target.value)}
                options={[{ value: "equals", label: "Equals" }]}
                disabled={!form.country}
                hint={!form.country ? "Pick a country above to enable." : undefined}
              />
              {/* The subsection stays 2-col; when no country is set, the
                  right-hand Match mode is a disabled placeholder rather
                  than absent, so the layout doesn't jump when the user
                  selects a country.  Same logic in "Restrict by client
                  IP" below. */}
              {form.country === "EU" && (
                <div className="col-span-full rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                  “EU” expands to: AT, BE, BG, HR, CY, CZ, DK, EE, FI, FR,
                  DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK,
                  SI, ES, SE.
                </div>
              )}
            </Subsection>

            {/* Client IP — optional */}
            <Subsection
              icon={<Wifi className="h-4 w-4" />}
              title="Restrict by client IP"
              optional
              intro="Only fire this rule when the incoming request comes from a specific IP or CIDR range.  Handy for allow-listing office networks or blocking known abusers.  Leave the field empty to allow every IP."
            >
              <Input
                label="Client IP or range"
                value={form.client_ip}
                placeholder="e.g. 192.168.1.0/24"
                onChange={(e) => set("client_ip", e.target.value)}
                error={fieldErrors.client_ip}
                hint={
                  fieldErrors.client_ip
                    ? undefined
                    : "IPv4, IPv6, a CIDR range, or a comma-separated list of any of the above."
                }
              />
              <Select
                label="Match mode"
                value={form.client_ip_key}
                onChange={(e) => set("client_ip_key", e.target.value)}
                options={[
                  { value: "equals", label: "Equals" },
                  { value: "starts_with", label: "Starts with" },
                  { value: "ipheader", label: "Read IP from header" },
                ]}
                disabled={!form.client_ip}
                hint={
                  !form.client_ip
                    ? "Enter an IP or range on the left to enable."
                    : "“Read IP from header” trusts an upstream proxy to tell wslproxy the real client IP."
                }
              />
            </Subsection>

            {/* Auth — optional */}
            <Subsection
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Require authentication"
              optional
              intro="Reject the request unless it carries a valid JWT, session cookie, or S3 signature.  Use this to protect internal APIs.  Leave on “None” to accept every request."
            >
              <Select
                label="Authentication method"
                value={form.jwt_token_validation}
                onChange={(e) =>
                  set("jwt_token_validation", e.target.value)
                }
                options={[
                  { value: "equals", label: "None (no auth required)" },
                  {
                    value: "cookie_jwt_token_validation",
                    label: "JWT in a cookie",
                  },
                  {
                    value: "cookie_key_value",
                    label: "Static value in a cookie",
                  },
                  {
                    value: "header_jwt_token_validation",
                    label: "JWT in a request header",
                  },
                  {
                    value: "amazon_s3_signed_header_validation",
                    label: "Amazon S3 signed request",
                  },
                ]}
              />
              {form.jwt_token_validation !== "equals" && (
                <>
                  <Input
                    label={validationFieldLabels.valueLabel}
                    hint={validationFieldLabels.valueHint}
                    value={form.jwt_token_validation_value}
                    onChange={(e) =>
                      set("jwt_token_validation_value", e.target.value)
                    }
                  />
                  {showTokenFields && (
                    <Input
                      label={validationFieldLabels.keyLabel}
                      hint={validationFieldLabels.keyHint}
                      type={isS3 ? "text" : "password"}
                      value={form.jwt_token_validation_key}
                      onChange={(e) =>
                        set("jwt_token_validation_key", e.target.value)
                      }
                    />
                  )}
                  {showS3Fields && (
                    <>
                      <Input
                        label="S3 region"
                        value={form.amazon_s3_region}
                        onChange={(e) =>
                          set("amazon_s3_region", e.target.value)
                        }
                      />
                      <Input
                        label="AWS access key"
                        type="password"
                        value={form.amazon_s3_access_key}
                        onChange={(e) =>
                          set("amazon_s3_access_key", e.target.value)
                        }
                      />
                      <Input
                        label="AWS secret key"
                        type="password"
                        value={form.amazon_s3_secret_key}
                        onChange={(e) =>
                          set("amazon_s3_secret_key", e.target.value)
                        }
                      />
                    </>
                  )}
                </>
              )}
            </Subsection>
          </div>
        </Card.Body>
      </Card>

      {/* ── Section 3: Response Configuration ────────────────────────── */}
      <Card>
        <Card.Header>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Response
            </h2>
            <p className="text-sm text-slate-500">
              What should wslproxy do with the request when this rule matches?
            </p>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">

            {/* Rule status + response type — top of the section, always shown */}
            <Subsection
              icon={<Zap className="h-4 w-4" />}
              title="Response type"
              intro="Pick what the client will see when this rule fires.  The rest of the form adapts to your choice — proxy pass shows a URL field, redirects show a target URL, custom responses show an HTML editor."
            >
              <Select
                label="Response type"
                value={String(form.code)}
                onChange={(e) => set("code", Number(e.target.value))}
                options={[
                  { value: "305", label: "Proxy to a backend (305)" },
                  { value: "301", label: "Permanent redirect (301)" },
                  { value: "302", label: "Temporary redirect (302)" },
                  { value: "200", label: "Return custom HTML (200)" },
                  { value: "403", label: "Block the request (403)" },
                ]}
                hint="Numbers in brackets are the underlying HTTP status codes wslproxy sends."
              />
              <div className="flex items-start pt-1 sm:pt-6">
                <Toggle
                  label="Rule enabled"
                  checked={form.allow}
                  onChange={(v) => set("allow", v)}
                />
              </div>
              {showRedirectUri && (
                <div className="sm:col-span-2">
                  <Input
                    label={`${redirectLabel} *`}
                    value={form.redirect_uri}
                    placeholder={
                      form.code === 305
                        ? "http://backend.example.com:8080"
                        : "https://example.com"
                    }
                    onChange={(e) => set("redirect_uri", e.target.value)}
                    error={fieldErrors.redirect_uri}
                    hint={
                      form.code === 305
                        ? "The internal backend wslproxy will proxy this request to.  Include the scheme and port."
                        : "The URL the client will be redirected to."
                    }
                  />
                </div>
              )}
            </Subsection>

            {/* Proxy options — only when it's a proxy pass */}
            {form.code === 305 && (
              <Subsection
                icon={<Settings className="h-4 w-4" />}
                title="Proxy options"
                intro="Fine-tune how the request is forwarded to the backend."
              >
                <div className="sm:col-span-2 flex flex-col gap-3">
                  <Toggle
                    label="Strip the matched path prefix before proxying"
                    checked={form.strip_path}
                    onChange={(v) => set("strip_path", v)}
                  />
                  <Toggle
                    label="Force HTTPS on the incoming request"
                    checked={form.auto_redirect_https}
                    onChange={(v) => set("auto_redirect_https", v)}
                  />
                  <Toggle
                    label="Resolve backend via Consul service discovery"
                    checked={form.is_consul}
                    onChange={(v) => set("is_consul", v)}
                  />
                </div>
                {form.is_consul && (
                  <div className="sm:col-span-2">
                    <Input
                      label="Consul service name"
                      value={form.consul_domain_name}
                      onChange={(e) =>
                        set("consul_domain_name", e.target.value)
                      }
                      hint="wslproxy will resolve this name via Consul SRV records at request time."
                    />
                  </div>
                )}
              </Subsection>
            )}

            {/* Custom HTML editor — 200/403 codes */}
            {showMessage && (
              <Subsection
                icon={<Route className="h-4 w-4" />}
                title="Custom response body"
                intro={
                  form.code === 403
                    ? "The HTML shown to blocked visitors.  Keep it short and explain who to contact."
                    : "The HTML wslproxy returns to the client.  Any valid HTML fragment works."
                }
              >
                <div className="sm:col-span-2">
                  <Textarea
                    label="Response HTML"
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    rows={8}
                    hint="Saved as Base64 behind the scenes — you edit plain HTML here."
                  />
                </div>
              </Subsection>
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

      {/* ── Action bar ─────────────────────────────────────────────────
          Sticky so it stays visible regardless of how tall the rule
          form grows (path/IP/JWT/S3/backends sections stack quickly).
          Matches the servers page treatment. */}
      <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex items-center justify-between border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
        <div>
          {!isCreate && (
            <Button variant="danger" onClick={() => setShowDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
              Delete Rule
            </Button>
          )}
        </div>
        <Button onClick={handleSubmit} loading={saving} icon={<Save className="h-4 w-4" />}>
          {isCreate ? "Create Rule" : "Save Changes"}
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
