"use client";

import { Globe, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

/**
 * "DNS Record Type" card — lives between the POPs picker and the DNS
 * State panel on the server form.  Lets the operator choose which
 * record type the provisioner manages for this server:
 *
 *   - **A**     : one A record per active POP (using public_ipv4).
 *                 The default — backwards compatible with servers
 *                 created before this field existed.
 *   - **AAAA**  : one AAAA record per active POP (using public_ipv6).
 *                 POPs without v6 set get skipped with reason
 *                 "no_public_ipv6".
 *   - **BOTH**  : A AND AAAA — dual-stack publishing.
 *   - **CNAME** : ONE CNAME record pointing at `dns_cname_target`;
 *                 POPs are not used.  Cannot coexist with A/AAAA on
 *                 the same name (DNS spec).
 *
 * Why a separate card (not inline in NginxServerTab): the mode is a
 * load-bearing routing decision that an operator wants to inspect at
 * a glance — and CNAME mode needs a conditional target input, which
 * gets noisy inline.
 */

type DnsRecordType = "A" | "AAAA" | "BOTH" | "CNAME";

interface DnsRecordTypeCardProps {
  value: DnsRecordType;
  cnameTarget: string;
  onChange: (type: DnsRecordType) => void;
  onCnameTargetChange: (target: string) => void;
  /** Show v6-only warning if no selected POP has public_ipv6 yet. */
  selectedPopsHaveV6?: boolean;
}

const OPTIONS: Array<{
  value: DnsRecordType;
  label: string;
  description: string;
}> = [
  {
    value: "A",
    label: "A — IPv4 per POP",
    description:
      "One A record per active POP using its public_ipv4.  Backwards-compatible default.",
  },
  {
    value: "AAAA",
    label: "AAAA — IPv6 per POP",
    description:
      "One AAAA record per active POP using its public_ipv6.  POPs without v6 set are skipped.",
  },
  {
    value: "BOTH",
    label: "BOTH — Dual-stack",
    description:
      "Publishes A AND AAAA records.  POPs without v6 still get an A record; the AAAA pass skips them.",
  },
  {
    value: "CNAME",
    label: "CNAME — Single hostname",
    description:
      "ONE CNAME pointing at the target hostname below.  POPs are ignored.  Cannot coexist with A/AAAA records on this name.",
  },
];

export default function DnsRecordTypeCard({
  value,
  cnameTarget,
  onChange,
  onCnameTargetChange,
  selectedPopsHaveV6,
}: DnsRecordTypeCardProps) {
  // Warn when AAAA/BOTH is selected but no chosen POP has IPv6 — the
  // provisioner will skip every POP for the AAAA pass, which surprises
  // operators who forgot to set public_ipv6 on the POPs.
  const showV6Warning =
    (value === "AAAA" || value === "BOTH") && selectedPopsHaveV6 === false;

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-center gap-2">
          <Globe className="h-5 w-5 text-slate-500" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            DNS Record Type
          </h3>
          <Badge variant="info" size="sm">
            {value}
          </Badge>
        </div>
      </Card.Header>
      <Card.Body>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Choose how the provisioner should publish this server&apos;s domain
          in Cloudflare.  The default <strong>A</strong> matches the legacy
          behaviour and is the right choice for most setups.
        </p>

        {/* ── Radio grid ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {OPTIONS.map((opt) => {
            const selected = value === opt.value;
            return (
              <label
                key={opt.value}
                className={
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
                  (selected
                    ? "border-primary-500 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 dark:hover:bg-slate-700/60")
                }
              >
                <input
                  type="radio"
                  name="dns_record_type"
                  value={opt.value}
                  checked={selected}
                  onChange={() => onChange(opt.value)}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-primary-600 focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {opt.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* ── Conditional CNAME target input ─────────────────────────── */}
        {value === "CNAME" && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              CNAME target <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={cnameTarget}
              onChange={(e) => onCnameTargetChange(e.target.value)}
              placeholder="edge.wslproxy.com"
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              required
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The hostname this server&apos;s domain should point at.  Must
              be an FQDN (no protocol, no trailing dot).  Cloudflare will
              follow the CNAME chain on resolution.
            </p>
          </div>
        )}

        {/* ── Warnings ───────────────────────────────────────────────── */}
        {showV6Warning && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">No POPs have IPv6 set</div>
              <div className="mt-1 text-xs">
                You picked <strong>{value}</strong> mode but none of your
                selected POPs have <code>public_ipv6</code> configured.  The
                provisioner will skip every POP for the AAAA pass.  Edit the
                POP records (in <code>/pops</code>) to add IPv6 addresses, or
                switch to <strong>A</strong> mode.
              </div>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
