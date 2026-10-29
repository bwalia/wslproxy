"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Bot Management — types and data access for /api/bot_defense/*
   (api/bot_defense/admin.lua).  The per-server policy type lives in
   components/servers/botDefenseTypes.ts and is shared with the server editor.
   ────────────────────────────────────────────────────────────────────────── */

import useSWR from "swr";
import { apiFetch } from "@/lib/api/client";
import { getEnvProfile } from "@/lib/api/data-provider";
import type { BotDefenseMode } from "@/components/servers/botDefenseTypes";

export type BotClass = "human" | "suspect" | "bot" | "verified_bot";
export type BotAction = "allow" | "challenge" | "block";
export type BotIvt = "none" | "givt" | "sivt";
export type SignalKind = "fingerprint" | "identity" | "behaviour";

export interface BotEngineStatus {
  loaded: boolean;
  loaded_at?: number;
  dict?: string;
  dict_ok?: boolean;
  dict_free_bytes?: number;
  secret_source?: "settings" | "derived" | "random" | "worker";
  overlay_active?: boolean;
  datacenter_ranges?: number;
  datacenter_rejected?: number;
  pow_difficulty?: number;
  challenge_ttl_s?: number;
  passed_ttl_s?: number;
  session_ttl_s?: number;
  ip_binding?: string;
  cookie_name?: string;
  verify_path?: string;
  reload_interval_s?: number;
  dns_nameservers?: string[];
}

export interface BotServerSummary {
  id: string;
  server_name: string;
  configured: boolean;
  mode: BotDefenseMode;
  challenge_at: number;
  block_at: number;
  challenge_paths: number;
  login_paths: number;
  monitor_paths: number;
  skip_paths: number;
  response_headers: boolean;
  forward_headers: boolean;
  bot_defense?: Record<string, unknown> | null;
}

export interface BotStatsRow {
  hour: number;
  class: Partial<Record<BotClass, number>>;
  action: Partial<Record<BotAction, number>>;
  ivt: Partial<Record<BotIvt, number>>;
}

export interface BotStats {
  hourly: BotStatsRow[];
  totals: {
    class: Partial<Record<BotClass, number>>;
    action: Partial<Record<BotAction, number>>;
    ivt: Partial<Record<BotIvt, number>>;
    challenge: Record<string, number>;
  };
  hosts: Record<string, Partial<Record<BotClass, number>>>;
}

export interface BotOverview {
  engine: BotEngineStatus;
  servers: BotServerSummary[];
  servers_by_mode: Partial<Record<BotDefenseMode, number>>;
  stats: BotStats;
}

export interface BotEvent {
  seq: number;
  ts: number;
  type: "decision" | "challenge";
  host?: string;
  ip?: string;
  method?: string;
  uri?: string;
  ua?: string;
  class?: BotClass;
  ivt?: BotIvt;
  score?: number;
  action?: BotAction;
  signals?: string;
  status?: number;
  result?: string;
  support_id?: string;
}

export interface BotSignal {
  code: string;
  kind: SignalKind;
  ivt: "givt" | "sivt";
  what: string;
  weight: number;
  default_weight: number;
}

export interface BotSettingsOverlay {
  pow_difficulty?: number;
  challenge_ttl_s?: number;
  passed_ttl_s?: number;
  session_ttl_s?: number;
  ip_binding?: "prefix" | "exact" | "none";
  weights?: Record<string, number>;
  datacenter_cidrs?: string[];
  datacenter_file?: string;
  dns_nameservers?: string[];
  dns_timeout_ms?: number;
}

export interface BotSettings {
  overlay: BotSettingsOverlay;
  effective: {
    pow_difficulty: number;
    challenge_ttl_s: number;
    passed_ttl_s: number;
    session_ttl_s: number;
    ip_binding: string;
    dns_timeout_ms: number;
    dns_nameservers: string[];
    datacenter_cidrs: number;
    datacenter_file?: string;
  };
  signals: BotSignal[];
  editable: string[];
  file: string;
  engine: BotEngineStatus;
}

export interface BotSimulationRequest {
  host?: string;
  method: string;
  path: string;
  scheme: "https" | "http";
  ip: string;
  http_version: number;
  headers: Record<string, string>;
}

export interface BotSimulation {
  server?: string;
  signals: (Pick<BotSignal, "code" | "kind" | "ivt" | "what" | "weight">)[];
  score?: number;
  class?: BotClass;
  ivt?: BotIvt;
  action: BotAction | "skip" | "off";
  mode?: string;
  thresholds?: { challenge: number; block: number };
  crawler?: string;
  crawler_verdict?: "verified" | "fake" | "unknown";
  browser?: string;
  browser_major?: number;
  tool?: string;
  response: string;
  note?: string;
}

const env = () => encodeURIComponent(getEnvProfile() || "prod");

async function getData<T>(path: string): Promise<T> {
  const res = await apiFetch<{ data: T }>(path);
  return res.data;
}

export function useBotOverview() {
  return useSWR<BotOverview>(`/bot_defense/overview?envprofile=${env()}`, getData, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });
}

export function useBotEvents(filters: Record<string, string>, autoRefresh: boolean) {
  const qs = new URLSearchParams({ limit: "500", ...filters }).toString();
  return useSWR<BotEvent[]>(`/bot_defense/events?${qs}`, getData, {
    refreshInterval: autoRefresh ? 10_000 : 0,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}

export function useBotSettings() {
  return useSWR<BotSettings>("/bot_defense/settings", getData, { revalidateOnFocus: false });
}

export async function saveServerPolicy(id: string, botDefense: Record<string, unknown>) {
  const res = await apiFetch<{ data: BotServerSummary }>(
    `/bot_defense/servers/${encodeURIComponent(id)}?envprofile=${env()}`,
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bot_defense: botDefense }) },
  );
  return res.data;
}

export async function saveBotSettings(overlay: BotSettingsOverlay) {
  const res = await apiFetch<{ data: BotSettings }>("/bot_defense/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overlay),
  });
  return res.data;
}

export async function simulateRequest(req: BotSimulationRequest) {
  const res = await apiFetch<{ data: BotSimulation }>(`/bot_defense/evaluate?envprofile=${env()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return res.data;
}

/* ── Presentation helpers shared by the pages ───────────────────────────── */

export type BadgeVariant = "default" | "info" | "warning" | "success" | "danger";

export const CLASS_BADGE: Record<BotClass, BadgeVariant> = {
  human: "success",
  verified_bot: "info",
  suspect: "warning",
  bot: "danger",
};

export const ACTION_BADGE: Record<string, BadgeVariant> = {
  allow: "default",
  challenge: "warning",
  block: "danger",
  skip: "info",
  off: "default",
};

export const IVT_BADGE: Record<BotIvt, BadgeVariant> = {
  none: "success",
  givt: "info",
  sivt: "warning",
};

export const MODE_BADGE: Record<BotDefenseMode, BadgeVariant> = {
  off: "default",
  monitor: "info",
  challenge: "warning",
  block: "danger",
};

export const IVT_LABEL: Record<BotIvt, string> = {
  none: "valid",
  givt: "general IVT",
  sivt: "sophisticated IVT",
};

export function fmtNumber(n: number | undefined): string {
  return (n ?? 0).toLocaleString();
}

export function fmtTime(epoch: number | undefined): string {
  if (!epoch) return "-";
  return new Date(epoch * 1000).toLocaleString();
}
