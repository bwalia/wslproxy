"use client";

import React, { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import type { ServerFormState } from "./types";
import type { WafPolicy } from "@/types";
import { cn } from "@/lib/utils/cn";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

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
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Anomaly Threshold</dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedPolicy.anomaly_threshold ?? "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Paranoia Level</dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedPolicy.paranoia_level ?? "N/A"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Body Inspection</dt>
                      <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {selectedPolicy.body_inspection ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Rules Count</dt>
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
    </div>
  );
};

WafProtectionTab.displayName = "WafProtectionTab";

export default React.memo(WafProtectionTab);
