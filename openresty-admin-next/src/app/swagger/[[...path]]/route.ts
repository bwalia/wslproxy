import type { NextRequest } from "next/server";
import { proxyToUpstream } from "@/lib/api/proxy-upstream";

/* Runtime reverse-proxy for /swagger and /swagger/*  →
 *   <WSLPROXY_API_URL>/swagger/...
 *
 * Same rationale as the /api proxy: the old build-time rewrite baked the
 * upstream port, so swagger broke on hosts using a non-default API port.
 * The optional catch-all `[[...path]]` covers both the bare `/swagger`
 * entry and nested assets / the openapi.json fetch.  Auth middleware
 * still runs for /swagger (it's not in the matcher's exclude list), so
 * the docs stay behind the admin login exactly as before. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  // Backend serves the UI at "/swagger/"; map bare "/swagger" there too.
  const suffix = path && path.length ? `/${path.join("/")}` : "/";
  return proxyToUpstream(req, `/swagger${suffix}`);
}

export const GET = handler;
export const HEAD = handler;
