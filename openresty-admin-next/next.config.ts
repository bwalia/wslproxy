import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  async rewrites() {
    const apiBase =
      process.env.WSLPROXY_API_URL ?? "http://wslproxy-local:8080";
    return [
      { source: "/health", destination: `${apiBase}/health` },
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
    ];
  },
};

export default nextConfig;
