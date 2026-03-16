import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy /api requests to the wslproxy OpenResty container.
  // In docker-compose-local the container is reachable at http://wslproxy-local:8080.
  // From the browser the same traffic arrives via the Next.js dev server proxy.
  async rewrites() {
    const apiBase = process.env.WSLPROXY_API_URL ?? "http://wslproxy-local:8080";
    return [
      // Proxy /health to the public wslproxy health endpoint (no auth required)
      {
        source: "/health",
        destination: `${apiBase}/health`,
      },
      // Proxy all /api/* requests to wslproxy
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
