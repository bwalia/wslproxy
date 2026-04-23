import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Instances — WSL Proxy Admin",
  description: "WSL Proxy instance metadata and cluster topology.",
};

export default function InstancesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
