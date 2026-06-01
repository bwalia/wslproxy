import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// ─── Content Security Policy ────────────────────────────────────────────
// Admin is a first-party app — no third-party scripts, no inline JS
// beyond what Next.js itself inlines for hydration.  We allow
// `'unsafe-inline'` + `'unsafe-eval'` only for SCRIPT in dev mode because
// Next.js dev needs them for Fast Refresh; production gets the strict
// variant.
//
// We rely on same-origin requests (`/api/*` is a rewrite, not cross-origin)
// so `connect-src 'self'` is sufficient.
function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // `data:` images are used by react-simple-maps for inline SVG encodings.
    // `blob:` is used by recharts for download/export features.
    "img-src 'self' data: blob: https://cdn.jsdelivr.net",
    // `connect-src` covers fetch/XHR.  The Geo map lazy-loads its
    // TopoJSON from the jsdelivr CDN, so we explicitly allow that
    // origin here — otherwise the browser blocks the request and the
    // map silently renders blank.
    "connect-src 'self' ws: wss: https://cdn.jsdelivr.net",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone",

  // Build-time type checking of <Link href>, useRouter().push() etc.
  // All hrefs must resolve to real app-router routes — typos become
  // compile errors instead of runtime 404s.
  typedRoutes: true,

  // ── Server Actions ────────────────────────────────────────────────
  // Next.js 16 rejects cross-origin Server Action requests by default
  // ("Invalid Server Actions request").  In the docker-compose dev
  // stack, nginx fronts the Next.js container on a non-matching port
  // (localhost:18280 → openresty-admin-next:7619) — the browser sends
  // `Origin: http://localhost:18280` which doesn't match the upstream
  // Host header, so Next.js aborts the action.
  //
  // `allowedOrigins` is Next's sanctioned opt-in.  We also set
  // `proxy_set_header Host $http_host` in `nginx-dev.conf.tmpl`, but
  // this list is the safety net for any additional proxy hops the
  // user might layer on (local IP access, LAN testing, etc.).
  //
  // Production deploys MUST set `WSLPROXY_ALLOWED_ORIGINS` (comma-
  // separated host:port list, e.g. `admin.example.com,proxy.example.com`)
  // — otherwise Server Actions behind a real domain will be rejected
  // and the admin UI will half-work in surprising ways.  The dev list
  // is kept as a fallback so `./dev.sh` and the local docker stack
  // continue to work without setting an env var.
  experimental: {
    serverActions: {
      allowedOrigins: (() => {
        const fromEnv = process.env.WSLPROXY_ALLOWED_ORIGINS;
        if (fromEnv && fromEnv.trim()) {
          return fromEnv
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        // Dev fallback — matches the docker-compose port mapping.
        return [
          "localhost:18280",
          "localhost:7619",
          "127.0.0.1:18280",
          "127.0.0.1:7619",
        ];
      })(),
    },
  },

  // Security-relevant headers for all routes
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: buildCsp() },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // Enable HSTS only in production so local HTTP dev isn't broken.
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },

  // NB: `/api/*` and `/swagger/*` are intentionally NOT build-time
  // rewrites.  Build-time rewrites freeze the upstream port
  // (WSLPROXY_API_URL) into the standalone artifact — which breaks on
  // hosts whose admin API isn't on the default port (e.g. prod pop0 on
  // :7691).  Both are now handled by RUNTIME proxy route handlers:
  //   src/app/api/[...path]/route.ts
  //   src/app/swagger/[[...path]]/route.ts
  // which read WSLPROXY_API_URL per request, so one bundle works on
  // every host and a deploy can never re-bake a wrong port.
  //
  // There is deliberately no `/health` route either — upstream nginx
  // owns `location /health` as a prefix match, so the dashboard lives
  // at `/system-status` to avoid the collision.
};

export default withBundleAnalyzer(nextConfig);
