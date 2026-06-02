import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title =
    id === "create" ? "New WAF rule" : `WAF rule · ${decodeURIComponent(id)}`;
  return {
    title: `${title} — WSL Proxy Admin`,
  };
}

export default function WafRuleDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
