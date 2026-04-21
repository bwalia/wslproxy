import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WAF policies — WSL Proxy Admin",
  description:
    "Web application firewall policies — paranoia level, anomaly threshold, rule bundling.",
};

export default function WafPoliciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
