import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Change requests — WSL Proxy Admin",
  description: "Pending configuration changes awaiting 4-eyes approval.",
};

export default function ChangeRequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
