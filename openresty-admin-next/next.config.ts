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
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:18280",
        "localhost:7619",
        "127.0.0.1:18280",
        "127.0.0.1:7619",
      ],
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

  async rewrites() {
    const apiBase =
      process.env.WSLPROXY_API_URL ?? "http://wslproxy-local:8080";
    return [
      // NB: there is NO `/health` rewrite here intentionally.  The
      // upstream nginx has `location /health` as a PREFIX match
      // that hands anything starting with "/health" (including
      // "/health-status", "/healthcheck", etc.) to the Lua JSON
      // probe — so the admin dashboard lives at `/system-status`
      // to sidestep the collision without touching nginx.
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      // Swagger UI is static HTML served by OpenResty at /swagger/.  We
      // proxy it under /swagger-ui/ so the Next.js page at /api-docs can
      // iframe it same-origin (no CORS + keeps dashboard chrome visible).
      { source: "/swagger-ui", destination: `${apiBase}/swagger/` },
      { source: "/swagger-ui/:path*", destination: `${apiBase}/swagger/:path*` },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
