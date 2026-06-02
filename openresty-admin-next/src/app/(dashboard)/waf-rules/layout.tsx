import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WAF rules — WSL Proxy Admin",
  description:
    "Web application firewall rules — severity, category, pattern, and action.",
};

export default function WafRulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
