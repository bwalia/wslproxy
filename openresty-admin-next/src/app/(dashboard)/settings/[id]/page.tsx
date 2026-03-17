"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsDetailPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings");
  }, [router]);

  return null;
}
