import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API docs — WSL Proxy Admin",
  description:
    "Interactive Swagger / OpenAPI documentation for the WSL Proxy REST API.",
};

export default function ApiDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
