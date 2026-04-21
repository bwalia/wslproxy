import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title =
    id === "create"
      ? "New WAF policy"
      : `WAF policy · ${decodeURIComponent(id)}`;
  return {
    title: `${title} — WSL Proxy Admin`,
  };
}

export default function WafPolicyDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
