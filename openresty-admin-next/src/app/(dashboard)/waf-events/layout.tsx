import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WAF events — WSL Proxy Admin",
  description:
    "Live feed of web-application-firewall rule matches and blocked requests.",
};

export default function WafEventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
