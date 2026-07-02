import type { NextRequest } from "next/server";
import { env } from "@/lib/config/env";

/* ──────────────────────────────────────────────────────────────────────────
   Runtime reverse-proxy to the Lua admin API / swagger.

   WHY THIS EXISTS (the bug it fixes):
     Next.js `rewrites()` in next.config are evaluated at BUILD time and
     frozen into the standalone routes-manifest.  That meant the upstream
     port (`WSLPROXY_API_URL`) got *baked into the artifact*.  Our hosts
     run the admin API on different ports (8080 default, 7691 on prod
     pop0), so a single baked bundle could only be correct on one host —
     and the delivery pipeline kept shipping a bundle baked with `:8080`
     to a host whose API is on `:7691`, giving ECONNREFUSED → 500 → empty
     server/rule lists.

     Server Components already dodged this because `server-client.ts`
     reads `env.apiUrl` (i.e. `WSLPROXY_API_URL`) at RUNTIME.  This route
     handler brings the browser-side `/api/*` path onto the same runtime
     resolution, so the bundle is host-agnostic: the systemd service's
     `Environment=WSLPROXY_API_URL=…` (set per host from
     nginx_default_server_backend_port) is the single source of truth and
     a deploy can never re-bake a wrong port again.

   Behaviour:
     - Streams the request through with method, query string, headers and
       body intact.
     - Forwards cookies both ways — critical for the httpOnly
       `wslproxy_token` set by POST /api/user/login.
     - Strips hop-by-hop headers (RFC 7230 §6.1) so we don't corrupt the
       connection / framing.
     - `redirect: "manual"` so 30x from the backend pass through verbatim
       (e.g. login redirects) instead of being silently followed here.
   ────────────────────────────────────────────────────────────────────────── */

// RFC 7230 hop-by-hop headers — must not be forwarded across a proxy.
// `host` and `content-length` are dropped so fetch sets them correctly
// for the upstream connection.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function upstreamBase(): string {
  // Read at runtime — NOT inlined at build.  Trailing slash trimmed so
  // we can append the path cleanly.
  return (env.apiUrl ?? "http://wslproxy-local:8080").replace(/\/+$/, "");
}

/**
 * Proxy `req` to `<WSLPROXY_API_URL><upstreamPath><original query>`.
 * `upstreamPath` must start with "/".
 */
export async function proxyToUpstream(
  req: NextRequest,
  upstreamPath: string,
): Promise<Response> {
  const target = `${upstreamBase()}${upstreamPath}${req.nextUrl.search}`;

  // Copy request headers minus hop-by-hop.
  const fwdHeaders = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) fwdHeaders.set(key, value);
  });

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: fwdHeaders,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch (err) {
    // Upstream unreachable (e.g. wrong port / service down).  Surface a
    // clear 502 instead of a generic Next.js 500 so it's obvious in logs
    // that the *backend* connection failed, not the dashboard.
    return new Response(
      JSON.stringify({
        error: {
          message: "Upstream API unreachable",
          target: target.replace(/\?.*$/, ""),
          detail: err instanceof Error ? err.message : String(err),
        },
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  // Copy response headers minus hop-by-hop; Set-Cookie handled separately
  // so multiple cookies aren't folded into one header.
  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie") return;
    if (!HOP_BY_HOP.has(lower)) respHeaders.set(key, value);
  });
  const setCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : [];
  for (const cookie of setCookies) respHeaders.append("set-cookie", cookie);

  // 204 No Content and 304 Not Modified are "null-body statuses" per
  // the Fetch spec — `new Response(body, { status: 304 })` throws
  // `TypeError: Response constructor: Invalid response status code
  // 304`, even if the body is an empty ArrayBuffer.  When the upstream
  // (loopback openresty on the admin port) answers a conditional GET
  // with 304 — trivially reproducible by hitting /swagger, cacheing
  // the ETag, then refreshing — this line used to crash with an
  // unhandled exception and Next.js surfaced it as HTTP 500.
  //
  // Repro before this fix (from journal on prod 187.124.112.155):
  //   TypeError: Response constructor: Invalid response status code 304
  //     at lJ (src_lib_api_proxy-upstream_ts_46e1c0ba._.js:38:2235)
  //     at async m (server/app/swagger/[[...path]]/route.ts)
  //
  // Fix: pass `null` as the body when the status forbids one; the
  // response's status + headers still forward verbatim.
  const isNullBodyStatus =
    upstream.status === 204 || upstream.status === 304;
  const respBody = isNullBodyStatus ? null : await upstream.arrayBuffer();
  return new Response(respBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
