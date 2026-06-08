import type { NextRequest } from "next/server";
import { proxyToUpstream } from "@/lib/api/proxy-upstream";

/* Runtime reverse-proxy for /metrics → <WSLPROXY_API_URL>/metrics.
 *
 * The Lua backend exposes Prometheus exposition format at /metrics
 * (see nginx-dev.conf.tmpl + nginx.conf.j2: `location /metrics`).  The
 * old Vite-based admin lived at a `/openresty-admin/` subpath, so
 * `/metrics` flowed through the upstream nginx directly and the
 * dashboard never had to think about it.  The Next.js standalone
 * server owns the whole port — without this proxy, scrapers hitting
 * `http://<dashboard-host>/metrics` get the dashboard's 404 shell
 * HTML instead of the metrics body.
 *
 * Same RUNTIME proxy pattern as /api/[...path] and /swagger — see
 * those route handlers for the rationale.  The proxy.ts middleware
 * declares /metrics as a public path so Prometheus scrapers (which
 * don't carry the admin login cookie) aren't redirected to /login;
 * the actual access control is the `allow <cidr>` ACL on the
 * backend's nginx location block.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest): Promise<Response> {
  return proxyToUpstream(req, "/metrics");
}

export const GET = handler;
export const HEAD = handler;
