import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Secrets — WSL Proxy Admin",
  description: "Encrypted credential storage.",
};

export default function SecretsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
