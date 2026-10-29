"use client";

import React, { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import TagInput from "@/components/ui/TagInput";
import type { ServerFormState } from "./types";
import {
  BOT_DEFENSE_LIMIT_LABELS,
  isValidBotDefensePath,
  type BotDefenseConfig,
  type BotDefenseLimits,
  type BotDefenseMode,
} from "./botDefenseTypes";
import type { WafPolicy } from "@/types";
import { cn } from "@/lib/utils/cn";
import { Bot, Shield, ShieldAlert, ShieldCheck } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface WafProtectionTabProps {
  form: ServerFormState;
  setForm: Dispatch<SetStateAction<ServerFormState>>;
  wafPolicies: WafPolicy[];
  wafPoliciesLoading: boolean;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const WAF_MODE_OPTIONS = [
  { value: "", label: "Default (use policy mode)" },
  { value: "block", label: "Block -- actively block threats" },
  { value: "monitor", label: "Monitor -- log only, do not block" },
];

const BOT_MODE_OPTIONS: { value: BotDefenseMode; label: string }[] = [
  { value: "off", label: "Off -- no bot scoring" },
  { value: "monitor", label: "Monitor -- score + tell the origin, never act" },
  { value: "challenge", label: "Challenge -- browser check for suspects, block bots" },
  { value: "block", label: "Block -- block suspects and bots" },
];

const BOT_MODE_BADGE: Record<BotDefenseMode, "default" | "info" | "warning" | "success"> = {
  off: "default",
  monitor: "info",
  challenge: "warning",
  block: "success",
};

const BOT_PATH_FIELDS: {
  key: "challenge_paths" | "login_paths" | "monitor_paths" | "skip_paths";
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: "challenge_paths",
    label: "Always challenge",
    hint: "A browser check is required once per session (checkout, sign-up, gift cards).",
    placeholder: "/checkout",
  },
  {
    key: "login_paths",
    label: "Login endpoints",
    hint: "POSTs here count towards the credential-stuffing limit.",
    placeholder: "/api/login",
  },
  {
    key: "monitor_paths",
    label: "Score only, never act",
    hint: "Verdict forwarded to the origin as X-WSL-Bot-IVT so it can filter (ad impressions, analytics).",
    placeholder: "/ad/",
  },
  {
    key: "skip_paths",
    label: "Skip entirely",
    hint: "Machine-to-machine endpoints a browser check would break (webhooks, callbacks).",
    placeholder: "/webhooks/",
  },
];

/* ── Component ─────────────────────────────────────────────────────────── */

const WafProtectionTab: React.FC<WafProtectionTabProps> = ({
  form,
  setForm,
  wafPolicies,
  wafPoliciesLoading,
}) => {
  const handleChange = useCallback(
    <K extends keyof ServerFormState>(field: K, value: ServerFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [setForm],
  );

  const policyOptions = useMemo(
    () =>
      wafPolicies.map((p) => ({
        value: p.id,
        label: `${p.name}${p.mode ? ` (${p.mode})` : ""}`,
      })),
    [wafPolicies],
  );

  const selectedPolicy = useMemo(
    () => wafPolicies.find((p) => p.id === form.waf_policy_id),
    [wafPolicies, form.waf_policy_id],
  );

  const bd = form.bot_defense;
  const setBd = useCallback(
    (patch: Partial<BotDefenseConfig>) => {
      setForm((prev) => ({ ...prev, bot_defense: { ...prev.bot_defense, ...patch } }));
    },
    [setForm],
  );
  const setLimit = useCallback(
    (key: keyof BotDefenseLimits, value: number) => {
      setForm((prev) => ({
        ...prev,
        bot_defense: {
          ...prev.bot_defense,
          limits: { ...prev.bot_defense.limits, [key]: value },
        },
      }));
    },
    [setForm],
  );
  const thresholdError =
    bd.thresholds.block < bd.thresholds.challenge
      ? "The block score must not be below the challenge score."
      : undefined;

  return (
    <div className="space-y-6">
      {/* ── WAF Toggle ───────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Web Application Firewall
            </h2>
          </div>
          <Badge variant={form.waf_enabled ? "success" : "default"} size="sm">
            {form.waf_enabled ? "Enabled" : "Disabled"}
          </Badge>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.waf_enabled}
                onChange={(e) => handleChange("waf_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Enable WAF protection for this server
            </label>

            {!form.waf_enabled && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      WAF is disabled
                    </p>
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                      Your server is not protected by a Web Application Firewall. Enable WAF to defend against
                      common web exploits like SQL injection, XSS, and more.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* ── Policy Selection ─────────────────────────────────────────── */}
      {form.waf_enabled && (
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              WAF Policy
            </h2>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              <Select
                label="Select WAF Policy"
                value={form.waf_policy_id}
                onChange={(e) => handleChange("waf_policy_id", e.target.value)}
                options={policyOptions}
                placeholder={wafPoliciesLoading ? "Loading policies..." : "Select a WAF policy"}
                disabled={wafPoliciesLoading}
              />

              <Select
                label="Mode Override"
                value={form.waf_mode_override}
                onChange={(e) => handleChange("waf_mode_override", e.target.value)}
                options={WAF_MODE_OPTIONS}
              />

              {/* Selected policy details */}
              {selectedPolicy && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedPolicy.name}
                    </span>
                    <Badge
                      variant={
                        selectedPolicy.mode === "block"
                          ? "danger"
                          : selectedPolicy.mode === "monitor"
                            ? "warning"
                            : "info"
                      }
                      size="sm"
                    >
                      {selectedPolicy.mode ?? "default"}
                    </Badge>
                  </div>

                  {selectedPolicy.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {selectedPolicy.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <dt className="text-sm text-slate-600 dark:text-slate-300">Anomaly Threshold</dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedPolicy.anomaly_threshold ?? "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600 dark:text-slate-300">Paranoia Level</dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedPolicy.paranoia_level ?? "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600 dark:text-slate-300">Body Inspection</dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedPolicy.body_inspection ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-600 dark:text-slate-300">Rules Count</dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedPolicy.waf_rules?.length ?? 0}
                      </dd>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* ── Bot Defense & IVT ────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Bot Defense &amp; Invalid Traffic
            </h2>
          </div>
          <Badge variant={BOT_MODE_BADGE[bd.mode]} size="sm">
            {bd.mode}
          </Badge>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            <Select
              label="Mode"
              value={bd.mode}
              onChange={(e) => setBd({ mode: e.target.value as BotDefenseMode })}
              options={BOT_MODE_OPTIONS}
            />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Native to wslproxy: no external service. Each request is scored from its fingerprint,
              its behaviour and its identity (verified search crawlers, data-centre IPs) and
              classed as human, suspect or bot, with an invalid-traffic tier (none / general /
              sophisticated). Takes effect on the next request. Start with monitor.
            </p>

            {bd.mode !== "off" && (
              <>
                {(bd.mode === "challenge" || bd.mode === "block") && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-500 shrink-0" />
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Scripts and API clients cannot run the browser check. Keep API hosts on
                        monitor, or list their machine-to-machine paths under &quot;Skip
                        entirely&quot;.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    label="Challenge at score"
                    value={bd.thresholds.challenge}
                    onChange={(e) =>
                      setBd({ thresholds: { ...bd.thresholds, challenge: Number(e.target.value) } })
                    }
                    hint="Suspect from this score (0–100)."
                  />
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    label="Block at score"
                    value={bd.thresholds.block}
                    onChange={(e) =>
                      setBd({ thresholds: { ...bd.thresholds, block: Number(e.target.value) } })
                    }
                    error={thresholdError}
                    hint="Bot from this score."
                  />
                </div>

                {BOT_PATH_FIELDS.map((f) => (
                  <TagInput
                    key={f.key}
                    label={f.label}
                    value={bd[f.key]}
                    onChange={(next) =>
                      setBd({ [f.key]: next.map((p) => p.trim()).filter(isValidBotDefensePath) })
                    }
                    options={[]}
                    placeholder={f.placeholder}
                    hint={`${f.hint} Ending in / or * matches a prefix.`}
                    maxTags={200}
                  />
                ))}

                <div className="space-y-2">
                  {(
                    [
                      ["allow_verified_bots", "Allow verified search crawlers (Google, Bing, Apple, Yandex, Baidu — checked by reverse + forward DNS)"],
                      ["forward_headers", "Send the verdict to the origin (X-WSL-Bot-Class / -Score / -IVT / -Signals)"],
                      ["response_headers", "Also show the verdict on responses (debugging and demos only — it helps bots tune)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={bd[key]}
                        onChange={(e) => setBd({ [key]: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <details className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-900 dark:text-slate-100">
                    Advanced — behaviour limits
                  </summary>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {(Object.keys(BOT_DEFENSE_LIMIT_LABELS) as (keyof BotDefenseLimits)[]).map((k) => (
                      <Input
                        key={k}
                        type="number"
                        min={1}
                        label={BOT_DEFENSE_LIMIT_LABELS[k]}
                        value={bd.limits[k]}
                        onChange={(e) => setLimit(k, Number(e.target.value))}
                      />
                    ))}
                  </div>
                </details>
              </>
            )}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

WafProtectionTab.displayName = "WafProtectionTab";

export default React.memo(WafProtectionTab);
