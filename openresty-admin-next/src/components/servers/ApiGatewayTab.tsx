"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  Shield,
  ChevronDown,
  Plus,
  Trash2,
  Zap,
  Code2,
  Route,
  AlertTriangle,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import TagInput from "@/components/ui/TagInput";
import type { ServerFormState } from "./types";
import {
  API_GW_MODULES,
  HTTP_METHODS,
  type ApiGwConfig,
  type ApiGwModule,
  type ApiGwRoute,
  type HeaderOp,
  type LuaHook,
  type RateProfile,
  defaultApiGwConfig,
} from "./apiGwTypes";
import { cn } from "@/lib/utils/cn";

/* ── Props ─────────────────────────────────────────────────────────────── */

export interface ApiGatewayTabProps {
  form: ServerFormState;
  setForm: Dispatch<SetStateAction<ServerFormState>>;
}

/* ── Small helpers ─────────────────────────────────────────────────────── */

function Section({
  id,
  title,
  subtitle,
  open,
  onToggle,
  step,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        id={`api-gw-${id}`}
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-b border-slate-200 px-6 py-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40"
        aria-expanded={open}
      >
        {step && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-semibold text-emerald-400 dark:bg-slate-950">
            {step}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <Card.Body className="space-y-4">{children}</Card.Body>}
    </Card>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function TriState({
  value,
  onChange,
  label,
  hint,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
      <Select
        value={value === null ? "" : value ? "true" : "false"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? null : v === "true");
        }}
        options={[
          { value: "", label: "Default (gateway)" },
          { value: "true", label: "On" },
          { value: "false", label: "Off" },
        ]}
      />
      {hint && (
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

const ApiGatewayTab: React.FC<ApiGatewayTabProps> = ({ form, setForm }) => {
  const gw = form.api_gw ?? defaultApiGwConfig();
  const [openId, setOpenId] = useState<string>("overview");

  const patch = useCallback(
    (fn: (prev: ApiGwConfig) => ApiGwConfig) => {
      setForm((prev) => ({
        ...prev,
        api_gw: fn(prev.api_gw ?? defaultApiGwConfig()),
      }));
    },
    [setForm],
  );

  const toggle = (id: string) =>
    setOpenId((cur) => (cur === id ? "" : id));

  const moduleSet = useMemo(() => new Set(gw.modules), [gw.modules]);

  const toggleModule = (id: ApiGwModule) => {
    patch((p) => {
      const has = p.modules.includes(id);
      return {
        ...p,
        modules: has
          ? p.modules.filter((m) => m !== id)
          : [...p.modules, id],
      };
    });
  };

  return (
    <div className="space-y-4">
      {/* Master switch */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              API Gateway
            </h2>
          </div>
          <Badge variant={gw.enabled ? "success" : "default"} size="sm">
            {gw.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </Card.Header>
        <Card.Body className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Kong-class edge policy for this server — CORS, correlation, IVT,
            auth, rate limiting, audit, and custom Lua hooks. Saved values take
            effect on the next request with no nginx reload.{" "}
            <code className="rounded bg-slate-100 px-1 text-xs dark:bg-slate-800">
              enabled: false
            </code>{" "}
            is the rollback switch.
          </p>
          <CheckRow
            checked={gw.enabled}
            onChange={(v) => patch((p) => ({ ...p, enabled: v }))}
            label="Enable API Gateway for this server"
            hint="Off = request path behaves exactly as before."
          />
          {gw.enabled && (
            <Grid>
              <Input
                label="Tenant ID (optional)"
                value={gw.tenant_id}
                onChange={(e) =>
                  patch((p) => ({ ...p, tenant_id: e.target.value }))
                }
                hint="Defaults to {profile}/{server_name}. Set only to share quotas across hostnames."
                placeholder="prod/api.example.com"
              />
            </Grid>
          )}
        </Card.Body>
      </Card>

      {!gw.enabled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/10">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Gateway modules are idle
              </p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                Enable the switch above to configure pipeline stages. Nested
                settings are retained while disabled.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <Section
            id="overview"
            step="0"
            title="Enabled modules"
            subtitle="Leave empty to run every module. Naming modules restricts the pipeline."
            open={openId === "overview"}
            onToggle={() => toggle("overview")}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {API_GW_MODULES.map((m) => (
                <CheckRow
                  key={m.id}
                  checked={moduleSet.size === 0 || moduleSet.has(m.id)}
                  onChange={() => {
                    if (moduleSet.size === 0) {
                      // Starting from "all" — select all except this one
                      patch((p) => ({
                        ...p,
                        modules: API_GW_MODULES.map((x) => x.id).filter(
                          (id) => id !== m.id,
                        ),
                      }));
                    } else {
                      toggleModule(m.id);
                    }
                  }}
                  label={m.label}
                />
              ))}
            </div>
            {moduleSet.size > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => patch((p) => ({ ...p, modules: [] }))}
              >
                Reset to all modules
              </Button>
            )}
          </Section>

          {/* 1. real_ip */}
          <Section
            id="real_ip"
            step="1"
            title="Trusted proxies"
            subtitle="Resolve the real client IP before any per-IP quota."
            open={openId === "real_ip"}
            onToggle={() => toggle("real_ip")}
          >
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-300">
              Configure this before turning on per-IP rate limits behind a load
              balancer — otherwise every request looks like it comes from the
              balancer.
            </div>
            <TagInput
              label="Trusted CIDRs"
              value={gw.real_ip.trusted_cidrs}
              onChange={(trusted_cidrs) =>
                patch((p) => ({
                  ...p,
                  real_ip: { ...p.real_ip, trusted_cidrs },
                }))
              }
              options={["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]}
              placeholder="Add CIDR…"
              hint="Empty = trust nothing; use the TCP peer."
            />
            <Grid>
              <Input
                label="Forwarded header"
                value={gw.real_ip.header}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    real_ip: { ...p.real_ip, header: e.target.value },
                  }))
                }
                hint="Default X-Forwarded-For"
                placeholder="X-Forwarded-For"
              />
              <TriState
                label="Recursive walk"
                value={gw.real_ip.recursive}
                onChange={(recursive) =>
                  patch((p) => ({
                    ...p,
                    real_ip: { ...p.real_ip, recursive },
                  }))
                }
                hint="Default on — walk right-to-left past trusted hops."
              />
            </Grid>
          </Section>

          {/* 2. request security */}
          <Section
            id="request_security"
            step="2"
            title="Request security"
            subtitle="Correlation ID, Content-Type enforcement, body size, token typ."
            open={openId === "request_security"}
            onToggle={() => toggle("request_security")}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Correlation ID
            </p>
            <Grid>
              <TriState
                label="Enabled"
                value={gw.request_security.correlation.enabled}
                onChange={(enabled) =>
                  patch((p) => ({
                    ...p,
                    request_security: {
                      ...p.request_security,
                      correlation: {
                        ...p.request_security.correlation,
                        enabled,
                      },
                    },
                  }))
                }
              />
              <Input
                label="Header name"
                value={gw.request_security.correlation.header}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    request_security: {
                      ...p.request_security,
                      correlation: {
                        ...p.request_security.correlation,
                        header: e.target.value,
                      },
                    },
                  }))
                }
                placeholder="X-Correlation-ID"
              />
              <TriState
                label="Echo to client"
                value={gw.request_security.correlation.echo_downstream}
                onChange={(echo_downstream) =>
                  patch((p) => ({
                    ...p,
                    request_security: {
                      ...p.request_security,
                      correlation: {
                        ...p.request_security.correlation,
                        echo_downstream,
                      },
                    },
                  }))
                }
              />
              <TriState
                label="Accept inbound id"
                value={gw.request_security.correlation.accept_inbound}
                onChange={(accept_inbound) =>
                  patch((p) => ({
                    ...p,
                    request_security: {
                      ...p.request_security,
                      correlation: {
                        ...p.request_security.correlation,
                        accept_inbound,
                      },
                    },
                  }))
                }
              />
            </Grid>

            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Content-Type & body
            </p>
            <CheckRow
              checked={gw.request_security.content_type.enforce}
              onChange={(enforce) =>
                patch((p) => ({
                  ...p,
                  request_security: {
                    ...p.request_security,
                    content_type: {
                      ...p.request_security.content_type,
                      enforce,
                    },
                  },
                }))
              }
              label="Enforce Content-Type"
            />
            <TagInput
              label="Methods to enforce"
              value={gw.request_security.content_type.methods}
              onChange={(methods) =>
                patch((p) => ({
                  ...p,
                  request_security: {
                    ...p.request_security,
                    content_type: {
                      ...p.request_security.content_type,
                      methods,
                    },
                  },
                }))
              }
              options={HTTP_METHODS}
              allowCreate={false}
            />
            <TagInput
              label="Allowed media types"
              value={gw.request_security.content_type.allow}
              onChange={(allow) =>
                patch((p) => ({
                  ...p,
                  request_security: {
                    ...p.request_security,
                    content_type: {
                      ...p.request_security.content_type,
                      allow,
                    },
                  },
                }))
              }
              options={["application/json", "application/*", "multipart/form-data"]}
              placeholder="application/json"
            />
            <TagInput
              label="Exempt path prefixes"
              value={gw.request_security.content_type.exempt_paths}
              onChange={(exempt_paths) =>
                patch((p) => ({
                  ...p,
                  request_security: {
                    ...p.request_security,
                    content_type: {
                      ...p.request_security.content_type,
                      exempt_paths,
                    },
                  },
                }))
              }
              options={[]}
              placeholder="/upload"
              allowCreate
            />
            <Grid>
              <Input
                label="Max body bytes (0 = off)"
                type="number"
                value={gw.request_security.max_body_bytes}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    request_security: {
                      ...p.request_security,
                      max_body_bytes:
                        e.target.value === "" ? "" : Number(e.target.value),
                    },
                  }))
                }
              />
              <CheckRow
                checked={gw.request_security.require_content_length}
                onChange={(require_content_length) =>
                  patch((p) => ({
                    ...p,
                    request_security: {
                      ...p.request_security,
                      require_content_length,
                    },
                  }))
                }
                label="Require Content-Length"
                hint="Rejects chunked body-bearing methods (411)."
              />
            </Grid>
          </Section>

          {/* 3. cors */}
          <Section
            id="cors"
            step="3"
            title="CORS"
            subtitle="Origins, methods, credentials, preflight."
            open={openId === "cors"}
            onToggle={() => toggle("cors")}
          >
            <TriState
              label="Enabled"
              value={gw.cors.enabled}
              onChange={(enabled) =>
                patch((p) => ({ ...p, cors: { ...p.cors, enabled } }))
              }
            />
            <TagInput
              label="Allowed origins"
              value={gw.cors.origins}
              onChange={(origins) =>
                patch((p) => ({ ...p, cors: { ...p.cors, origins } }))
              }
              options={["*", "https://*.example.com"]}
              placeholder="https://app.example.com"
              allowCreate
            />
            <TagInput
              label="Methods"
              value={gw.cors.methods}
              onChange={(methods) =>
                patch((p) => ({ ...p, cors: { ...p.cors, methods } }))
              }
              options={HTTP_METHODS}
              allowCreate={false}
            />
            <TagInput
              label="Request headers"
              value={gw.cors.headers}
              onChange={(headers) =>
                patch((p) => ({ ...p, cors: { ...p.cors, headers } }))
              }
              options={["Authorization", "Content-Type", "X-Request-ID"]}
              allowCreate
            />
            <TagInput
              label="Expose headers"
              value={gw.cors.expose_headers}
              onChange={(expose_headers) =>
                patch((p) => ({ ...p, cors: { ...p.cors, expose_headers } }))
              }
              options={["X-Correlation-ID", "RateLimit-Remaining"]}
              allowCreate
            />
            <Grid>
              <CheckRow
                checked={gw.cors.credentials}
                onChange={(credentials) =>
                  patch((p) => ({ ...p, cors: { ...p.cors, credentials } }))
                }
                label="Allow credentials"
              />
              <Input
                label="Max-Age (seconds)"
                type="number"
                value={gw.cors.max_age}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    cors: {
                      ...p.cors,
                      max_age:
                        e.target.value === "" ? "" : Number(e.target.value),
                    },
                  }))
                }
                hint="Default 3600"
              />
              <CheckRow
                checked={gw.cors.preflight_continue}
                onChange={(preflight_continue) =>
                  patch((p) => ({
                    ...p,
                    cors: { ...p.cors, preflight_continue },
                  }))
                }
                label="Forward preflight upstream"
              />
            </Grid>
          </Section>

          {/* 4. ivt */}
          <Section
            id="ivt"
            step="4"
            title="Invalid traffic (IVT)"
            subtitle="Weighted signals — method, path, auth shape, spoofed headers, burst."
            open={openId === "ivt"}
            onToggle={() => toggle("ivt")}
          >
            <Select
              label="Mode"
              value={gw.ivt.mode}
              onChange={(e) =>
                patch((p) => ({
                  ...p,
                  ivt: {
                    ...p.ivt,
                    mode: e.target.value as ApiGwConfig["ivt"]["mode"],
                  },
                }))
              }
              options={[
                { value: "disabled", label: "Disabled" },
                { value: "audit", label: "Audit (silent)" },
                { value: "monitor", label: "Monitor (+ X-WSL-IVT header)" },
                { value: "block", label: "Block at threshold" },
              ]}
            />
            <TagInput
              label="Allow methods (empty = any)"
              value={gw.ivt.methods_allow}
              onChange={(methods_allow) =>
                patch((p) => ({ ...p, ivt: { ...p.ivt, methods_allow } }))
              }
              options={HTTP_METHODS}
              allowCreate={false}
            />
            <TagInput
              label="Deny methods"
              value={gw.ivt.methods_deny}
              onChange={(methods_deny) =>
                patch((p) => ({ ...p, ivt: { ...p.ivt, methods_deny } }))
              }
              options={HTTP_METHODS}
              allowCreate={false}
            />
            <TagInput
              label="Path denylist (PCRE)"
              value={gw.ivt.path_denylist}
              onChange={(path_denylist) =>
                patch((p) => ({ ...p, ivt: { ...p.ivt, path_denylist } }))
              }
              options={["\\.php$", "/wp-admin", "/\\.env"]}
              allowCreate
            />
            <TagInput
              label="Strip header prefixes"
              value={gw.ivt.strip_header_prefixes}
              onChange={(strip_header_prefixes) =>
                patch((p) => ({
                  ...p,
                  ivt: { ...p.ivt, strip_header_prefixes },
                }))
              }
              options={["X-Internal-", "X-Forwarded-"]}
              allowCreate
              hint="Removed from upstream request; also scores header_spoof."
            />
            <Grid>
              <CheckRow
                checked={gw.ivt.require_auth_shape}
                onChange={(require_auth_shape) =>
                  patch((p) => ({
                    ...p,
                    ivt: { ...p.ivt, require_auth_shape },
                  }))
                }
                label="Require Authorization shape"
              />
              <Input
                label="Block threshold"
                type="number"
                value={gw.ivt.block_threshold}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    ivt: {
                      ...p.ivt,
                      block_threshold:
                        e.target.value === "" ? "" : Number(e.target.value),
                    },
                  }))
                }
                hint="Default 3"
              />
              <Input
                label="Burst max requests"
                type="number"
                value={gw.ivt.burst.max_requests}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    ivt: {
                      ...p.ivt,
                      burst: {
                        ...p.ivt.burst,
                        max_requests:
                          e.target.value === "" ? "" : Number(e.target.value),
                      },
                    },
                  }))
                }
                hint="0 disables burst counter"
              />
              <Input
                label="Burst window (seconds)"
                type="number"
                value={gw.ivt.burst.window_seconds}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    ivt: {
                      ...p.ivt,
                      burst: {
                        ...p.ivt.burst,
                        window_seconds:
                          e.target.value === "" ? "" : Number(e.target.value),
                      },
                    },
                  }))
                }
              />
            </Grid>
          </Section>

          {/* 5. auth */}
          <Section
            id="auth"
            step="5"
            title="Edge authentication"
            subtitle="none / passthrough / jwt / api_key — origin stays authoritative by default."
            open={openId === "auth"}
            onToggle={() => toggle("auth")}
          >
            <Select
              label="Strategy"
              value={gw.auth.strategy}
              onChange={(e) =>
                patch((p) => ({
                  ...p,
                  auth: {
                    ...p.auth,
                    strategy: e.target
                      .value as ApiGwConfig["auth"]["strategy"],
                  },
                }))
              }
              options={[
                { value: "passthrough", label: "Passthrough (default)" },
                { value: "none", label: "None (public)" },
                { value: "jwt", label: "JWT (edge verify)" },
                { value: "api_key", label: "API key" },
              ]}
            />
            <TagInput
              label="Public paths"
              value={gw.auth.public_paths}
              onChange={(public_paths) =>
                patch((p) => ({ ...p, auth: { ...p.auth, public_paths } }))
              }
              options={["/health", "/healthz", "/.well-known/"]}
              allowCreate
            />
            <TagInput
              label="Protected paths (empty = all)"
              value={gw.auth.protected_paths}
              onChange={(protected_paths) =>
                patch((p) => ({ ...p, auth: { ...p.auth, protected_paths } }))
              }
              options={["/admin", "/v1/"]}
              allowCreate
            />
            {(gw.auth.strategy === "jwt" ||
              gw.auth.strategy === "passthrough") && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  JWT
                </p>
                <Grid>
                  <Input
                    label="Secret ref"
                    value={gw.auth.jwt.secret_ref}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        auth: {
                          ...p.auth,
                          jwt: { ...p.auth.jwt, secret_ref: e.target.value },
                        },
                      }))
                    }
                    placeholder="secret://my-jwt#key or env://JWT_SECRET"
                    hint="Prefer refs — never commit raw secrets."
                  />
                  <Input
                    label="Algorithm"
                    value={gw.auth.jwt.alg}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        auth: {
                          ...p.auth,
                          jwt: { ...p.auth.jwt, alg: e.target.value },
                        },
                      }))
                    }
                    placeholder="HS256"
                  />
                  <Input
                    label="Issuer"
                    value={gw.auth.jwt.issuer}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        auth: {
                          ...p.auth,
                          jwt: { ...p.auth.jwt, issuer: e.target.value },
                        },
                      }))
                    }
                  />
                  <Input
                    label="Audience"
                    value={gw.auth.jwt.audience}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        auth: {
                          ...p.auth,
                          jwt: { ...p.auth.jwt, audience: e.target.value },
                        },
                      }))
                    }
                  />
                  <Input
                    label="Claim key (consumer id)"
                    value={gw.auth.jwt.claim_key}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        auth: {
                          ...p.auth,
                          jwt: { ...p.auth.jwt, claim_key: e.target.value },
                        },
                      }))
                    }
                    placeholder="sub"
                  />
                </Grid>
              </>
            )}
            {gw.auth.strategy === "api_key" && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  API key
                </p>
                <Grid>
                  <Input
                    label="Header"
                    value={gw.auth.api_key.header}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        auth: {
                          ...p.auth,
                          api_key: {
                            ...p.auth.api_key,
                            header: e.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="X-API-Key"
                  />
                  <Input
                    label="Keys ref"
                    value={gw.auth.api_key.keys_ref}
                    onChange={(e) =>
                      patch((p) => ({
                        ...p,
                        auth: {
                          ...p.auth,
                          api_key: {
                            ...p.auth.api_key,
                            keys_ref: e.target.value,
                          },
                        },
                      }))
                    }
                    placeholder="secret://api-keys#bundle"
                  />
                </Grid>
                <TagInput
                  label="Inline keys / refs"
                  value={gw.auth.api_key.keys}
                  onChange={(keys) =>
                    patch((p) => ({
                      ...p,
                      auth: {
                        ...p.auth,
                        api_key: { ...p.auth.api_key, keys },
                      },
                    }))
                  }
                  options={[]}
                  allowCreate
                  hint="Prefer secret:// refs over literals."
                />
              </>
            )}
          </Section>

          {/* 6. rate limit */}
          <Section
            id="rate_limit"
            step="6"
            title="Rate limiting"
            subtitle="Named profiles keyed by IP, consumer, header, or jwt.sub."
            open={openId === "rate_limit"}
            onToggle={() => toggle("rate_limit")}
          >
            <TriState
              label="Enabled"
              value={gw.rate_limit.enabled}
              onChange={(enabled) =>
                patch((p) => ({
                  ...p,
                  rate_limit: { ...p.rate_limit, enabled },
                }))
              }
            />
            <Grid>
              <Select
                label="Algorithm"
                value={gw.rate_limit.algorithm}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    rate_limit: {
                      ...p.rate_limit,
                      algorithm: e.target.value as "sliding" | "fixed",
                    },
                  }))
                }
                options={[
                  { value: "sliding", label: "Sliding window" },
                  { value: "fixed", label: "Fixed window" },
                ]}
              />
              <Input
                label="Default profile"
                value={gw.rate_limit.default_profile}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    rate_limit: {
                      ...p.rate_limit,
                      default_profile: e.target.value,
                    },
                  }))
                }
                placeholder="standard"
              />
            </Grid>
            <RateProfilesEditor
              profiles={gw.rate_limit.profiles}
              onChange={(profiles) =>
                patch((p) => ({
                  ...p,
                  rate_limit: { ...p.rate_limit, profiles },
                }))
              }
            />
          </Section>

          {/* 7. audit */}
          <Section
            id="audit"
            step="7"
            title="Audit log"
            subtitle="Structured JSON lines on the nginx error log (credentials always redacted)."
            open={openId === "audit"}
            onToggle={() => toggle("audit")}
          >
            <TriState
              label="Enabled"
              value={gw.audit.enabled}
              onChange={(enabled) =>
                patch((p) => ({ ...p, audit: { ...p.audit, enabled } }))
              }
            />
            <Grid>
              <Select
                label="Level"
                value={gw.audit.level}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    audit: {
                      ...p.audit,
                      level: e.target
                        .value as ApiGwConfig["audit"]["level"],
                    },
                  }))
                }
                options={[
                  { value: "debug", label: "debug" },
                  { value: "info", label: "info" },
                  { value: "notice", label: "notice" },
                  { value: "warn", label: "warn" },
                  { value: "error", label: "error" },
                ]}
              />
              <Input
                label="Tag"
                value={gw.audit.tag}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    audit: { ...p.audit, tag: e.target.value },
                  }))
                }
                placeholder="wsl_api_gw"
              />
              <Input
                label="Sample rate (0–1)"
                type="number"
                step="0.01"
                value={gw.audit.sample_rate}
                onChange={(e) =>
                  patch((p) => ({
                    ...p,
                    audit: {
                      ...p.audit,
                      sample_rate:
                        e.target.value === "" ? "" : Number(e.target.value),
                    },
                  }))
                }
                hint="Rejections always kept"
              />
            </Grid>
            <CheckRow
              checked={gw.audit.include_query}
              onChange={(include_query) =>
                patch((p) => ({ ...p, audit: { ...p.audit, include_query } }))
              }
              label="Include query string"
              hint="Off by default — query strings often carry tokens."
            />
            <CheckRow
              checked={gw.audit.include_client_ip}
              onChange={(include_client_ip) =>
                patch((p) => ({
                  ...p,
                  audit: { ...p.audit, include_client_ip },
                }))
              }
              label="Include raw client IP"
            />
            <TagInput
              label="Extra headers to capture"
              value={gw.audit.include_headers}
              onChange={(include_headers) =>
                patch((p) => ({
                  ...p,
                  audit: { ...p.audit, include_headers },
                }))
              }
              options={["User-Agent", "X-Request-ID"]}
              allowCreate
            />
          </Section>

          {/* 8. hooks */}
          <Section
            id="hooks"
            step="8"
            title="Hooks & header transforms"
            subtitle="Declarative set/remove/rename plus custom Lua for complex cases."
            open={openId === "hooks"}
            onToggle={() => toggle("hooks")}
          >
            <CheckRow
              checked={gw.hooks.enabled}
              onChange={(enabled) => {
                patch((p) => {
                  const modules = new Set(p.modules);
                  if (enabled) modules.add("hooks");
                  return {
                    ...p,
                    hooks: { ...p.hooks, enabled },
                    modules:
                      p.modules.length === 0
                        ? p.modules
                        : Array.from(modules) as ApiGwModule[],
                  };
                });
              }}
              label="Enable hooks module"
              hint="Also ensure “hooks” is in the enabled modules list (or leave modules empty)."
            />
            <HeaderOpsEditor
              title="Request header transforms"
              icon={<Zap className="h-4 w-4 text-emerald-500" />}
              ops={gw.hooks.request_headers}
              onChange={(request_headers) =>
                patch((p) => ({
                  ...p,
                  hooks: { ...p.hooks, request_headers },
                }))
              }
            />
            <HeaderOpsEditor
              title="Response header transforms"
              icon={<Zap className="h-4 w-4 text-sky-500" />}
              ops={gw.hooks.response_headers}
              onChange={(response_headers) =>
                patch((p) => ({
                  ...p,
                  hooks: { ...p.hooks, response_headers },
                }))
              }
            />
            <LuaHooksEditor
              hooks={gw.hooks.lua}
              onChange={(lua) =>
                patch((p) => ({ ...p, hooks: { ...p.hooks, lua } }))
              }
            />
          </Section>

          {/* 9. routes */}
          <Section
            id="routes"
            step="9"
            title="Route policy matrix"
            subtitle="Most-specific path match wins — overrides auth, rate profile, IVT, body size."
            open={openId === "routes"}
            onToggle={() => toggle("routes")}
          >
            <RoutesEditor
              routes={gw.routes}
              profileNames={Object.keys(gw.rate_limit.profiles)}
              onChange={(routes) => patch((p) => ({ ...p, routes }))}
            />
          </Section>
        </>
      )}
    </div>
  );
};

/* ── Sub-editors ───────────────────────────────────────────────────────── */

function HeaderOpsEditor({
  title,
  icon,
  ops,
  onChange,
}: {
  title: string;
  icon: React.ReactNode;
  ops: HeaderOp[];
  onChange: (ops: HeaderOp[]) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
          {icon}
          {title}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([...ops, { op: "set", name: "", value: "" }])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Values may use{" "}
        <code className="text-[11px]">
          {"{{server_name}} {{tenant}} {{client_ip}} {{correlation_id}} {{uri}}"}
        </code>
      </p>
      {ops.length === 0 && (
        <p className="text-xs text-slate-400">No transforms yet.</p>
      )}
      {ops.map((op, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-md bg-slate-50 p-3 dark:bg-slate-900/40 sm:grid-cols-12"
        >
          <div className="sm:col-span-2">
            <Select
              value={op.op}
              onChange={(e) => {
                const next = [...ops];
                next[i] = {
                  ...op,
                  op: e.target.value as HeaderOp["op"],
                };
                onChange(next);
              }}
              options={[
                { value: "set", label: "set" },
                { value: "remove", label: "remove" },
                { value: "rename", label: "rename" },
              ]}
            />
          </div>
          {op.op === "rename" ? (
            <>
              <div className="sm:col-span-4">
                <Input
                  placeholder="From"
                  value={op.from || ""}
                  onChange={(e) => {
                    const next = [...ops];
                    next[i] = { ...op, from: e.target.value };
                    onChange(next);
                  }}
                />
              </div>
              <div className="sm:col-span-4">
                <Input
                  placeholder="To"
                  value={op.to || ""}
                  onChange={(e) => {
                    const next = [...ops];
                    next[i] = { ...op, to: e.target.value };
                    onChange(next);
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-4">
                <Input
                  placeholder="Header name"
                  value={op.name || ""}
                  onChange={(e) => {
                    const next = [...ops];
                    next[i] = { ...op, name: e.target.value };
                    onChange(next);
                  }}
                />
              </div>
              {op.op === "set" && (
                <div className="sm:col-span-4">
                  <Input
                    placeholder="Value"
                    value={op.value || ""}
                    onChange={(e) => {
                      const next = [...ops];
                      next[i] = { ...op, value: e.target.value };
                      onChange(next);
                    }}
                  />
                </div>
              )}
            </>
          )}
          <div className="flex items-end sm:col-span-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(ops.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LuaHooksEditor({
  hooks,
  onChange,
}: {
  hooks: LuaHook[];
  onChange: (h: LuaHook[]) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
          <Code2 className="h-4 w-4 text-violet-500" />
          Custom Lua hooks
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([
              ...hooks,
              {
                name: "",
                phase: "access_before",
                file: "",
                source: "",
              },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add hook
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Prefer <code className="text-[11px]">hooks/name.lua</code> under{" "}
        <code className="text-[11px]">$NGINX_CONFIG_DIR/data/</code>. Source must{" "}
        <code className="text-[11px]">return function(cfg, ctx, policy)</code>.
        Fail-open on errors. Phases: access_before (after real_ip),
        access_after (after rate_limit), header_filter.
      </p>
      {hooks.map((h, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md bg-slate-50 p-3 dark:bg-slate-900/40"
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              label="Name"
              value={h.name}
              onChange={(e) => {
                const next = [...hooks];
                next[i] = { ...h, name: e.target.value };
                onChange(next);
              }}
              placeholder="enrich_tenant"
            />
            <Select
              label="Phase"
              value={h.phase}
              onChange={(e) => {
                const next = [...hooks];
                next[i] = {
                  ...h,
                  phase: e.target.value as LuaHook["phase"],
                };
                onChange(next);
              }}
              options={[
                { value: "access_before", label: "access_before" },
                { value: "access_after", label: "access_after" },
                { value: "header_filter", label: "header_filter" },
              ]}
            />
            <Input
              label="File (preferred)"
              value={h.file || ""}
              onChange={(e) => {
                const next = [...hooks];
                next[i] = { ...h, file: e.target.value };
                onChange(next);
              }}
              placeholder="hooks/enrich.lua"
            />
          </div>
          <Textarea
            label="Inline source (optional)"
            value={h.source || ""}
            onChange={(e) => {
              const next = [...hooks];
              next[i] = { ...h, source: e.target.value };
              onChange(next);
            }}
            rows={6}
            className="font-mono text-xs"
            placeholder={`return function(cfg, ctx, policy)\n  -- mutate ctx / ngx.req / ctx.response_headers\n  -- return a decision table to terminate, or nil to continue\nend`}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(hooks.filter((_, j) => j !== i))}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5 text-red-500" />
            Remove hook
          </Button>
        </div>
      ))}
    </div>
  );
}

function RateProfilesEditor({
  profiles,
  onChange,
}: {
  profiles: Record<string, RateProfile>;
  onChange: (p: Record<string, RateProfile>) => void;
}) {
  const entries = Object.entries(profiles);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Profiles
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            const name = `custom_${entries.length + 1}`;
            onChange({
              ...profiles,
              [name]: {
                limit: 100,
                window_seconds: 60,
                key: "ip",
                algorithm: "",
              },
            });
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add profile
        </Button>
      </div>
      {entries.map(([name, p]) => (
        <div
          key={name}
          className="grid gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-6"
        >
          <Input
            label="Name"
            value={name}
            onChange={(e) => {
              const next = { ...profiles };
              delete next[name];
              next[e.target.value || name] = p;
              onChange(next);
            }}
          />
          <Input
            label="Limit"
            type="number"
            value={p.limit}
            onChange={(e) =>
              onChange({
                ...profiles,
                [name]: {
                  ...p,
                  limit: e.target.value === "" ? "" : Number(e.target.value),
                },
              })
            }
            hint="0 = unlimited"
          />
          <Input
            label="Window (s)"
            type="number"
            value={p.window_seconds}
            onChange={(e) =>
              onChange({
                ...profiles,
                [name]: {
                  ...p,
                  window_seconds:
                    e.target.value === "" ? "" : Number(e.target.value),
                },
              })
            }
          />
          <Select
            label="Key"
            value={p.key}
            onChange={(e) =>
              onChange({
                ...profiles,
                [name]: {
                  ...p,
                  key: e.target.value as RateProfile["key"],
                },
              })
            }
            options={[
              { value: "ip", label: "ip" },
              { value: "consumer", label: "consumer" },
              { value: "header", label: "header" },
              { value: "jwt.sub", label: "jwt.sub" },
            ]}
          />
          <Input
            label="Header (if key=header)"
            value={p.header || ""}
            onChange={(e) =>
              onChange({
                ...profiles,
                [name]: { ...p, header: e.target.value },
              })
            }
          />
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = { ...profiles };
                delete next[name];
                onChange(next);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoutesEditor({
  routes,
  profileNames,
  onChange,
}: {
  routes: ApiGwRoute[];
  profileNames: string[];
  onChange: (r: ApiGwRoute[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Route className="h-4 w-4 text-primary-500" />
          Routes
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([
              ...routes,
              {
                name: "",
                path: "/",
                path_key: "starts_with",
                methods: [],
                auth: "",
                rate_profile: "",
                max_body_bytes: "",
                ivt_mode: "",
              },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add route
        </Button>
      </div>
      {routes.map((rt, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700"
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              label="Name"
              value={rt.name}
              onChange={(e) => {
                const next = [...routes];
                next[i] = { ...rt, name: e.target.value };
                onChange(next);
              }}
            />
            <Input
              label="Path"
              value={rt.path}
              onChange={(e) => {
                const next = [...routes];
                next[i] = { ...rt, path: e.target.value };
                onChange(next);
              }}
            />
            <Select
              label="Match"
              value={rt.path_key}
              onChange={(e) => {
                const next = [...routes];
                next[i] = {
                  ...rt,
                  path_key: e.target.value as ApiGwRoute["path_key"],
                };
                onChange(next);
              }}
              options={[
                { value: "starts_with", label: "starts_with" },
                { value: "equals", label: "equals" },
                { value: "regex", label: "regex" },
              ]}
            />
          </div>
          <TagInput
            label="Methods"
            value={rt.methods}
            onChange={(methods) => {
              const next = [...routes];
              next[i] = { ...rt, methods };
              onChange(next);
            }}
            options={HTTP_METHODS}
            allowCreate={false}
          />
          <div className="grid gap-2 sm:grid-cols-4">
            <Select
              label="Auth override"
              value={rt.auth}
              onChange={(e) => {
                const next = [...routes];
                next[i] = {
                  ...rt,
                  auth: e.target.value as ApiGwRoute["auth"],
                };
                onChange(next);
              }}
              options={[
                { value: "", label: "Inherit" },
                { value: "none", label: "none" },
                { value: "passthrough", label: "passthrough" },
                { value: "jwt", label: "jwt" },
                { value: "api_key", label: "api_key" },
              ]}
            />
            <Select
              label="Rate profile"
              value={rt.rate_profile}
              onChange={(e) => {
                const next = [...routes];
                next[i] = { ...rt, rate_profile: e.target.value };
                onChange(next);
              }}
              options={[
                { value: "", label: "Default" },
                ...profileNames.map((n) => ({ value: n, label: n })),
              ]}
            />
            <Select
              label="IVT mode"
              value={rt.ivt_mode}
              onChange={(e) => {
                const next = [...routes];
                next[i] = {
                  ...rt,
                  ivt_mode: e.target.value as ApiGwRoute["ivt_mode"],
                };
                onChange(next);
              }}
              options={[
                { value: "", label: "Inherit" },
                { value: "disabled", label: "disabled" },
                { value: "audit", label: "audit" },
                { value: "monitor", label: "monitor" },
                { value: "block", label: "block" },
              ]}
            />
            <Input
              label="Max body bytes"
              type="number"
              value={rt.max_body_bytes}
              onChange={(e) => {
                const next = [...routes];
                next[i] = {
                  ...rt,
                  max_body_bytes:
                    e.target.value === "" ? "" : Number(e.target.value),
                };
                onChange(next);
              }}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(routes.filter((_, j) => j !== i))}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5 text-red-500" />
            Remove route
          </Button>
        </div>
      ))}
    </div>
  );
}

export default ApiGatewayTab;
