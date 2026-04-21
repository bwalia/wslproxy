import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title =
    id === "create" ? "New rule" : `Rule · ${decodeURIComponent(id)}`;
  return {
    title: `${title} — WSL Proxy Admin`,
  };
}

export default function RuleDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
