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

// Inject this just before </head> so relative URLs in the Lua-served
// swagger HTML resolve under /swagger/.  The HTML contains
//   SwaggerUIBundle({ url: "openapi.yaml" })
// which, without a base href, resolves to /openapi.yaml after Next.js
// strips the trailing slash from /swagger/ → /swagger.  The fetch
// 404s and the UI renders blank.  A `<base href="/swagger/">` tag is
// the surgical fix — it doesn't change the upstream and works whether
// the browser landed on /swagger or /swagger/.
const BASE_TAG = '<base href="/swagger/">';

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  // Backend serves the UI at "/swagger/"; map bare "/swagger" there too.
  const suffix = path && path.length ? `/${path.join("/")}` : "/";
  const upstreamResponse = await proxyToUpstream(req, `/swagger${suffix}`);

  // Only rewrite the entry HTML — nested assets (CSS/JS/openapi.yaml)
  // are streamed through untouched so binary payloads aren't corrupted
  // and we don't double-inject on follow-up fetches.
  const isEntryHtml =
    (!path || path.length === 0) &&
    (upstreamResponse.headers.get("content-type") ?? "")
      .toLowerCase()
      .includes("text/html");
  if (!isEntryHtml) return upstreamResponse;

  // Defence-in-depth: even for the entry HTML path, don't try to
  // rewrite null-body responses.  `proxyToUpstream` already returns
  // these with a null body, but if the upstream ever preserves
  // `content-type: text/html` on a 304/205 (nginx does), the
  // `new Response(rewritten, { status: 304 })` at the bottom of this
  // function would throw the same TypeError as the proxy did before
  // its fix.
  if (
    upstreamResponse.status === 204 ||
    upstreamResponse.status === 205 ||
    upstreamResponse.status === 304
  ) {
    return upstreamResponse;
  }

  const html = await upstreamResponse.text();
  // If the upstream ever starts emitting its own <base> tag, leave it
  // alone — avoids accidentally adding a conflicting second tag.
  const rewritten = html.includes("<base ")
    ? html
    : html.replace(/<head([^>]*)>/i, `<head$1>\n  ${BASE_TAG}`);

  // Preserve all original headers EXCEPT:
  //   - Content-Length: the body changed; fetch will recompute it.
  //   - Content-Encoding: fetch().text() above already decompressed
  //     the upstream body, so what we're returning is plain text.
  //     Leaving the upstream `gzip` value in place makes the browser
  //     try to gunzip plain text → ERR_CONTENT_DECODING_FAILED →
  //     blank page.  This is the classic reverse-proxy footgun.
  const headers = new Headers(upstreamResponse.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(rewritten, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

export const GET = handler;
export const HEAD = handler;
