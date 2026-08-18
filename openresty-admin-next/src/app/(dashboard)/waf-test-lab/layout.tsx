import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WAF Test Lab — WSL Proxy Admin",
  description:
    "Fire attack payloads (GET and POST) at any allow-listed host and see, per rule, what the WAF blocks — matched rule, violation code and support id.",
};

export default function WafTestLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
