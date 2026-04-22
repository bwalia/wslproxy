import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sessions — WSL Proxy Admin",
  description: "Active admin sessions stored in Redis.",
};

export default function SessionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
