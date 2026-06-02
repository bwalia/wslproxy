import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Change request · ${decodeURIComponent(id)} — WSL Proxy Admin`,
  };
}

export default function ChangeRequestDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
