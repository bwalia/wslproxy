import type { NextRequest } from "next/server";
import { proxyToUpstream } from "@/lib/api/proxy-upstream";

/* Runtime reverse-proxy for /api/*  →  <WSLPROXY_API_URL>/api/*
 *
 * Replaces the old build-time next.config rewrite, which baked the
 * upstream port into the standalone artifact and broke on hosts whose
 * admin API isn't on the default port (see proxy-upstream.ts for the
 * full story).  `/api/*` is excluded from the auth middleware matcher,
 * so requests reach here directly and the Lua backend does its own JWT
 * check. */

// Must run on Node (needs process.env + fetch to an internal host) and
// must never be cached/prerendered — every call is a live proxy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const suffix = path && path.length ? `/${path.join("/")}` : "";
  return proxyToUpstream(req, `/api${suffix}`);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
