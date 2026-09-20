import type { NextRequest } from "next/server";
import { proxyToUpstream } from "@/lib/api/proxy-upstream";

/* Runtime reverse-proxy for /mcp/* → <WSLPROXY_API_URL>/mcp/*
 *
 * Same pattern as /api/[...path] and /metrics.  Public admin hosts
 * (e.g. https://lon1.pop0.uk) terminate on the Next.js standalone
 * server; without this route, /mcp/jsonrpc never reaches OpenResty's
 * Lua MCP handler and src/proxy.ts 307s unauthenticated clients to
 * /login — which MCP clients then re-POST and see as HTTP 405.
 *
 * Auth for MCP is X-MCP-API-Key (or open mode) inside api/mcp/auth.lua,
 * not the dashboard cookie.  Keep /mcp out of the proxy.ts matcher
 * (and PUBLIC_PREFIXES) so agents reach this handler.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const suffix = path && path.length ? `/${path.join("/")}` : "";
  return proxyToUpstream(req, `/mcp${suffix}`);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
