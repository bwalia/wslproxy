import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Users — WSL Proxy Admin",
  description: "Administrator accounts and role management.",
};

export default function UsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
