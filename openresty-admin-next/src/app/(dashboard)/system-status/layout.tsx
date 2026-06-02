import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Health — WSL Proxy Admin",
  description:
    "System diagnostics — nginx workers, Redis, disk, CPU, memory, and backend health.",
};

export default function HealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
