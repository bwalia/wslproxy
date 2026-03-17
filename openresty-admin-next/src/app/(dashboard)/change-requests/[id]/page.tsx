"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChangeRequestDetailPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/change-requests");
  }, [router]);

  return null;
}
