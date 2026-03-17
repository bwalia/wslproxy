import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for production deployment behind nginx
  // Produces a self-contained Node.js server in .next/standalone
  output: "standalone",

  // Proxy /api requests to the wslproxy OpenResty container.
  // In dev mode (next dev), the Next.js dev server proxies API requests.
  // In production, nginx handles API routing directly on the same port.
  async rewrites() {
    const apiBase =
      process.env.WSLPROXY_API_URL ?? "http://wslproxy-local:8080";
    return [
      {
        source: "/health",
        destination: `${apiBase}/health`,
      },
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
