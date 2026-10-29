import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bot Management — WSL Proxy Admin",
  description:
    "Native bot defense and invalid-traffic (IVT) classification: per-server protection, live decisions, edge settings and a request simulator.",
};

export default function BotManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
