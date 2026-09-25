"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { ItemList, type BulkItem } from "@/components/ui/BulkActions";
import { useList } from "@/hooks/useResource";
import { apiFetch, encodePayload } from "@/lib/api/client";
import { getEnvProfile } from "@/lib/api/data-provider";
import { useNotification } from "@/contexts/NotificationContext";
import type { WafPolicy } from "@/types";

/** Response of POST /api/waf_rules/apply (api/api.lua applyWafRulesToPolicy). */
interface ApplyResult {
  policy_id: string;
  action: "add" | "remove";
  changed: string[];
  unchanged: string[];
  missing: string[];
  total_rules: number;
}

/**
 * Add or remove several WAF rules on one policy in a single request.
 * The backend merges into the policy's `waf_rules` list itself, so the
 * rest of the policy is never rewritten from a possibly stale copy.
 */
export default function ApplyRulesToPolicyDialog({
  open,
  items,
  onClose,
  onApplied,
}: {
  open: boolean;
  items: BulkItem[];
  onClose: () => void;
  onApplied: (result: ApplyResult) => void;
}) {
  const { notify } = useNotification();
  const [policyId, setPolicyId] = useState("");
  const [action, setAction] = useState<"add" | "remove">("add");
  const [busy, setBusy] = useState(false);

  const params = useMemo(
    () => ({
      pagination: { page: 1, perPage: 500 },
      sort: { field: "name", order: "ASC" as const },
      filter: {},
    }),
    [],
  );
  const { data: policies, isLoading } = useList<WafPolicy>(
    open ? "waf_policies" : null,
    params,
  );

  useEffect(() => {
    if (open && !policyId && policies.length > 0) setPolicyId(policies[0].id);
  }, [open, policyId, policies]);

  const policy = policies.find((p) => p.id === policyId);
  const current = new Set(
    Array.isArray(policy?.waf_rules) ? policy.waf_rules.map(String) : [],
  );
  const alreadyIn = items.filter((i) => current.has(i.id)).length;
  const effective = action === "add" ? items.length - alreadyIn : alreadyIn;

  const apply = useCallback(async () => {
    if (!policyId) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ data: ApplyResult }>("/waf_rules/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: encodePayload({
          policy_id: policyId,
          rule_ids: items.map((i) => i.id),
          action,
          envProfile: getEnvProfile(),
        }),
      });
      const r = res.data;
      const verb = action === "add" ? "Added" : "Removed";
      const extra = [
        r.unchanged.length
          ? `${r.unchanged.length} already ${action === "add" ? "in" : "not in"} the policy`
          : "",
        r.missing.length ? `${r.missing.length} not found` : "",
      ]
        .filter(Boolean)
        .join(", ");
      notify(
        `${verb} ${r.changed.length} rule${r.changed.length === 1 ? "" : "s"} ` +
          `${action === "add" ? "to" : "from"} ${policy?.name ?? policyId} ` +
          `(now ${r.total_rules})${extra ? ` · ${extra}` : ""}`,
        { type: r.missing.length ? "warning" : "success" },
      );
      onApplied(r);
    } catch (e) {
      notify(
        `Could not update the policy: ${e instanceof Error ? e.message : String(e)}`,
        { type: "error" },
      );
    } finally {
      setBusy(false);
    }
  }, [policyId, items, action, policy?.name, notify, onApplied]);

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={`Apply ${items.length} WAF rule${items.length === 1 ? "" : "s"} to a policy`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={apply}
            loading={busy}
            disabled={!policyId || effective === 0}
          >
            {action === "add" ? `Add ${effective}` : `Remove ${effective}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Policy"
          value={policyId}
          onChange={(e) => setPolicyId(e.target.value)}
          options={policies.map((p) => ({
            value: p.id,
            label: `${p.name} (${Array.isArray(p.waf_rules) ? p.waf_rules.length : 0} rules)`,
          }))}
          placeholder={isLoading ? "loading policies…" : "no WAF policies"}
        />
        <Select
          label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value as "add" | "remove")}
          options={[
            { value: "add", label: "Add to the policy" },
            { value: "remove", label: "Remove from the policy" },
          ]}
        />
        {policy && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {action === "add"
              ? `${effective} of ${items.length} will be added; ${alreadyIn} already in this policy.`
              : `${effective} of ${items.length} are in this policy and will be removed.`}
          </p>
        )}
        <ItemList items={items} />
      </div>
    </Dialog>
  );
}
