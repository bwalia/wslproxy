import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upstreams — WSL Proxy Admin",
  description:
    "Backend server pools — load balancing, health checks, and keepalive configuration.",
};

export default function UpstreamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
