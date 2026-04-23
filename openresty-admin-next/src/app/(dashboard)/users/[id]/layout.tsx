import type { Metadata } from "next";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const title =
    id === "create" ? "New user" : `User · ${decodeURIComponent(id)}`;
  return {
    title: `${title} — WSL Proxy Admin`,
  };
}

export default function UserDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
