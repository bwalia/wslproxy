/* ──────────────────────────────────────────────────────────────────────────
   Bot Defense (api/bot_defense/) — the per-server "bot_defense" object.
   Defaults mirror api/bot_defense/config.lua.  A server save replaces the
   whole record, so the form keeps the entire object (unknown keys included)
   and sends it back as-is.
   ────────────────────────────────────────────────────────────────────────── */

export type BotDefenseMode = "off" | "monitor" | "challenge" | "block";

export interface BotDefenseLimits {
  burst_per_10s: number;
  distinct_paths_per_min: number;
  errors_per_min: number;
  logins_per_5min: number;
  cookieless_requests: number;
  pages_without_assets: number;
}

export interface BotDefenseConfig {
  mode: BotDefenseMode;
  thresholds: { challenge: number; block: number };
  limits: BotDefenseLimits;
  skip_paths: string[];
  login_paths: string[];
  challenge_paths: string[];
  monitor_paths: string[];
  allow_verified_bots: boolean;
  forward_headers: boolean;
  response_headers: boolean;
  [extra: string]: unknown;
}

export const BOT_DEFENSE_LIMIT_LABELS: Record<keyof BotDefenseLimits, string> = {
  burst_per_10s: "Requests per IP per 10 s",
  distinct_paths_per_min: "Distinct pages per visitor per minute",
  errors_per_min: "401/403/404/405 per IP per minute",
  logins_per_5min: "Login attempts per IP per 5 min",
  cookieless_requests: "Requests without the session cookie",
  pages_without_assets: "Pages loaded with no CSS/JS/images",
};

export const DEFAULT_BOT_DEFENSE: BotDefenseConfig = {
  mode: "off",
  thresholds: { challenge: 40, block: 80 },
  limits: {
    burst_per_10s: 40,
    distinct_paths_per_min: 40,
    errors_per_min: 20,
    logins_per_5min: 6,
    cookieless_requests: 3,
    pages_without_assets: 12,
  },
  skip_paths: [],
  login_paths: [],
  challenge_paths: [],
  monitor_paths: [],
  allow_verified_bots: true,
  forward_headers: true,
  response_headers: false,
};

const MODES: BotDefenseMode[] = ["off", "monitor", "challenge", "block"];

const paths = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** On-disk value → form state.  Anything missing or malformed falls back to
 *  the default; unknown keys are kept so a save does not drop them. */
export function normalizeBotDefense(raw: unknown): BotDefenseConfig {
  const d = DEFAULT_BOT_DEFENSE;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return structuredClone(d);
  }
  const r = raw as Record<string, unknown>;
  const t = (r.thresholds ?? {}) as Record<string, unknown>;
  const l = (r.limits ?? {}) as Record<string, unknown>;
  const limits = { ...d.limits };
  (Object.keys(limits) as (keyof BotDefenseLimits)[]).forEach((k) => {
    limits[k] = num(l[k], d.limits[k]);
  });
  return {
    ...r,
    mode: MODES.includes(r.mode as BotDefenseMode) ? (r.mode as BotDefenseMode) : "off",
    thresholds: {
      challenge: num(t.challenge, d.thresholds.challenge),
      block: num(t.block, d.thresholds.block),
    },
    limits,
    skip_paths: paths(r.skip_paths),
    login_paths: paths(r.login_paths),
    challenge_paths: paths(r.challenge_paths),
    monitor_paths: paths(r.monitor_paths),
    allow_verified_bots: r.allow_verified_bots !== false,
    forward_headers: r.forward_headers !== false,
    response_headers: r.response_headers === true,
  };
}

export const isValidBotDefensePath = (p: string) =>
  p.startsWith("/") && !/\s/.test(p) && p.length <= 512;
