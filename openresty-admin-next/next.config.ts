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
    "connect-src 'self' ws: wss:",
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
      { source: "/health", destination: `${apiBase}/health` },
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
