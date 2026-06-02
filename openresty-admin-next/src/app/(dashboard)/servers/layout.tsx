import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Servers — WSL Proxy Admin",
  description:
    "Manage virtual servers — SSL certificates, caching, rate limiting, WAF, rules, and Varnish.",
};

export default function ServersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
