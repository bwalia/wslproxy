import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",

  // Security-relevant headers for all routes
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
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
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
