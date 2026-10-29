"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, Save, RotateCcw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import TagInput from "@/components/ui/TagInput";
import { useNotification } from "@/contexts/NotificationContext";
import BotNav from "@/components/bot-management/BotNav";
import {
  IVT_BADGE,
  IVT_LABEL,
  saveBotSettings,
  useBotSettings,
  type BotSettingsOverlay,
  type BotSignal,
} from "@/components/bot-management/api";

/* Edge-wide tuning saved to data/bot_defense/settings.json on this edge and
   laid over settings.json "bot_defense" (which deploys rewrite from SOPS).
   A blank field means "not overridden here". */

interface FormState {
  pow_difficulty: string;
  challenge_ttl_s: string;
  passed_ttl_s: string;
  session_ttl_s: string;
  ip_binding: string;
  dns_timeout_ms: string;
  dns_nameservers: string[];
  datacenter_cidrs: string;
  datacenter_file: string;
  weights: Record<string, string>;
}

const EMPTY: FormState = {
  pow_difficulty: "", challenge_ttl_s: "", passed_ttl_s: "", session_ttl_s: "", ip_binding: "",
  dns_timeout_ms: "", dns_nameservers: [], datacenter_cidrs: "", datacenter_file: "", weights: {},
};

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function fromOverlay(o: BotSettingsOverlay): FormState {
  const weights: Record<string, string> = {};
  Object.entries(o.weights ?? {}).forEach(([k, v]) => { weights[k] = String(v); });
  return {
    pow_difficulty: str(o.pow_difficulty),
    challenge_ttl_s: str(o.challenge_ttl_s),
    passed_ttl_s: str(o.passed_ttl_s),
    session_ttl_s: str(o.session_ttl_s),
    ip_binding: str(o.ip_binding),
    dns_timeout_ms: str(o.dns_timeout_ms),
    dns_nameservers: Array.isArray(o.dns_nameservers) ? o.dns_nameservers : [],
    datacenter_cidrs: Array.isArray(o.datacenter_cidrs) ? o.datacenter_cidrs.join("\n") : "",
    datacenter_file: str(o.datacenter_file),
    weights,
  };
}

function toOverlay(f: FormState): BotSettingsOverlay {
  const o: BotSettingsOverlay = {};
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  if (num(f.pow_difficulty) !== undefined) o.pow_difficulty = num(f.pow_difficulty);
  if (num(f.challenge_ttl_s) !== undefined) o.challenge_ttl_s = num(f.challenge_ttl_s);
  if (num(f.passed_ttl_s) !== undefined) o.passed_ttl_s = num(f.passed_ttl_s);
  if (num(f.session_ttl_s) !== undefined) o.session_ttl_s = num(f.session_ttl_s);
  if (num(f.dns_timeout_ms) !== undefined) o.dns_timeout_ms = num(f.dns_timeout_ms);
  if (f.ip_binding) o.ip_binding = f.ip_binding as BotSettingsOverlay["ip_binding"];
  if (f.dns_nameservers.length) o.dns_nameservers = f.dns_nameservers;
  const cidrs = f.datacenter_cidrs.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (cidrs.length) o.datacenter_cidrs = cidrs;
  if (f.datacenter_file.trim()) o.datacenter_file = f.datacenter_file.trim();
  const weights: Record<string, number> = {};
  Object.entries(f.weights).forEach(([k, v]) => { if (v.trim() !== "") weights[k] = Number(v); });
  if (Object.keys(weights).length) o.weights = weights;
  return o;
}

const KIND_ORDER = ["fingerprint", "identity", "behaviour"] as const;
const KIND_LABEL: Record<string, string> = {
  fingerprint: "Fingerprint — what the request claims, and whether it adds up",
  identity: "Identity — verified crawlers and data-centre IPs",
  behaviour: "Behaviour — what an IP or visitor has been doing",
};

export default function BotSettingsPage() {
  const { notify } = useNotification();
  const { data, error, isLoading, mutate } = useBotSettings();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(fromOverlay(data.overlay ?? {}));
  }, [data]);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v })), []);
  const eff = data?.effective;

  const grouped = useMemo(() => {
    const g: Record<string, BotSignal[]> = {};
    (data?.signals ?? []).forEach((s) => { (g[s.kind] ??= []).push(s); });
    return g;
  }, [data?.signals]);

  const dirty = useMemo(
    () => data !== undefined && JSON.stringify(toOverlay(form)) !== JSON.stringify(toOverlay(fromOverlay(data.overlay ?? {}))),
    [form, data],
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const next = await saveBotSettings(toOverlay(form));
      await mutate(next, { revalidate: false });
      notify("Bot Defense settings saved — live on this worker now, every worker within the reload interval", { type: "success" });
    } catch (e) {
      notify(`Not saved: ${e instanceof Error ? e.message : String(e)}`, { type: "error" });
    } finally {
      setSaving(false);
    }
  }, [form, mutate, notify]);

  return (
    <div>
      <PageHeader
        title="Bot settings & signals"
        icon={SlidersHorizontal}
        subtitle="Edge-wide tuning for every protected server on this edge"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" disabled={!dirty || saving} onClick={() => data && setForm(fromOverlay(data.overlay ?? {}))}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5">Discard</span>
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty}>
              <Save className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5">Save</span>
            </Button>
          </div>
        }
      />
      <BotNav />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Could not load settings: {(error as Error).message}
        </div>
      )}

      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        Saved to <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{data?.file ?? "data/bot_defense/settings.json"}</code> on
        this edge and laid over the SOPS settings. A blank field keeps the current value (shown greyed). The
        session/challenge key, cookie name and shared dict stay in SOPS. Per-server mode, thresholds and paths are on each
        server&apos;s WAF tab and on the Overview.
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Browser check &amp; sessions</h2>
          </Card.Header>
          <Card.Body>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                type="number" min={8} max={24} label="Proof-of-work difficulty (bits)"
                placeholder={eff ? String(eff.pow_difficulty) : ""}
                value={form.pow_difficulty} onChange={(e) => set("pow_difficulty", e.target.value)}
                hint="Each +1 doubles the work. 16 ≈ 0.2 s in a browser."
              />
              <Select
                label="Bind sessions to" value={form.ip_binding}
                onChange={(e) => set("ip_binding", e.target.value)}
                options={[
                  { value: "", label: `Current (${eff?.ip_binding ?? "prefix"})` },
                  { value: "prefix", label: "Network (/24, /64) — recommended" },
                  { value: "exact", label: "Exact IP — strictest, mobile users re-checked often" },
                  { value: "none", label: "User-Agent only — loosest" },
                ]}
              />
              <Input
                type="number" min={30} max={3600} label="Check must be solved within (s)"
                placeholder={eff ? String(eff.challenge_ttl_s) : ""}
                value={form.challenge_ttl_s} onChange={(e) => set("challenge_ttl_s", e.target.value)}
              />
              <Input
                type="number" min={60} max={604800} label="A passed check is trusted for (s)"
                placeholder={eff ? String(eff.passed_ttl_s) : ""}
                value={form.passed_ttl_s} onChange={(e) => set("passed_ttl_s", e.target.value)}
              />
              <Input
                type="number" min={60} max={604800} label="Session cookie lifetime (s)"
                placeholder={eff ? String(eff.session_ttl_s) : ""}
                value={form.session_ttl_s} onChange={(e) => set("session_ttl_s", e.target.value)}
              />
            </div>
          </Card.Body>
        </Card>

        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Identity</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">{eff?.datacenter_cidrs ?? 0} inline ranges active</span>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              <Textarea
                label="Data-centre ranges (one CIDR per line)"
                rows={5}
                placeholder={"203.0.113.0/24\n2001:db8::/32"}
                value={form.datacenter_cidrs}
                onChange={(e) => set("datacenter_cidrs", e.target.value)}
                hint="Traffic from these is general IVT (BD_DATACENTER). For the full cloud lists use a file."
              />
              <Input
                label="Data-centre range file"
                placeholder={eff?.datacenter_file ?? "data/bot_defense/datacenter.cidr"}
                value={form.datacenter_file}
                onChange={(e) => set("datacenter_file", e.target.value)}
                hint="Under data/. Build it with scripts/bot-defense-datacenter-ranges.sh (AWS, GCP, Oracle, DigitalOcean)."
              />
              <TagInput
                label="Crawler-verification DNS servers"
                value={form.dns_nameservers}
                onChange={(next) => set("dns_nameservers", next.map((s) => s.trim()).filter(Boolean))}
                options={[]}
                placeholder={(eff?.dns_nameservers ?? []).join(", ") || "1.1.1.1"}
                hint="Blank uses the host's resolver (/etc/resolv.conf)."
                maxTags={4}
              />
              <Input
                type="number" min={50} max={5000} label="DNS timeout (ms)"
                placeholder={eff ? String(eff.dns_timeout_ms) : ""}
                value={form.dns_timeout_ms} onChange={(e) => set("dns_timeout_ms", e.target.value)}
              />
            </div>
          </Card.Body>
        </Card>
      </div>

      <Card className="mt-6">
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Signals &amp; weights</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            score = sum of raised weights (max 100) · suspect from 40 · bot from 80 (per server)
          </span>
        </Card.Header>
        <Card.Body>
          {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {KIND_ORDER.filter((k) => grouped[k]?.length).map((kind) => (
            <div key={kind} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{KIND_LABEL[kind]}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Signal</th>
                      <th className="py-2 pr-3 font-medium">Meaning</th>
                      <th className="py-2 pr-3 font-medium">IVT</th>
                      <th className="w-28 py-2 pr-3 text-right font-medium">Default</th>
                      <th className="w-32 py-2 font-medium">Weight here</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[kind].map((s) => (
                      <tr key={s.code} className="border-b border-slate-100 align-top dark:border-slate-800">
                        <td className="py-2 pr-3"><code className="text-xs text-slate-800 dark:text-slate-200">{s.code}</code></td>
                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">{s.what}</td>
                        <td className="whitespace-nowrap py-2 pr-3"><Badge variant={IVT_BADGE[s.ivt]} size="sm">{IVT_LABEL[s.ivt]}</Badge></td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{s.default_weight}</td>
                        <td className="py-2">
                          <Input
                            type="number" min={0} max={100}
                            aria-label={`Weight for ${s.code}`}
                            placeholder={String(s.weight)}
                            value={form.weights[s.code] ?? ""}
                            onChange={(e) => set("weights", { ...form.weights, [s.code]: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </Card.Body>
      </Card>
    </div>
  );
}
