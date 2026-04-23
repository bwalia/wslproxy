import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit log — WSL Proxy Admin",
  description:
    "History of configuration changes — who did what and when.",
};

export default function AuditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
