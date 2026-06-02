import { Suspense } from "react";
import { ScrollText } from "lucide-react";
import Skeleton from "@/components/ui/Skeleton";
import Card, { CardBody } from "@/components/ui/Card";
import TailViewer from "./TailViewer";

/* ──────────────────────────────────────────────────────────────────────────
   Full-screen log viewer route — `/logs/tail?kind=error|access&q=...`.

   Thin Server Component shell whose only job is to render the
   interactive client-side `<TailViewer>` inside a Suspense boundary
   so the skeleton shows during first mount hydration.  Search state
   is owned by the client component and synced to `?q=` so links are
   shareable (incident response workflow).
   ────────────────────────────────────────────────────────────────────────── */

export default function LogsTailPage() {
  return (
    // `flex-1` fills the dashboard <main>'s flex column.  See
    // `(dashboard)/layout.tsx` for the matching <main> change.
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<TailSkeleton />}>
        <TailViewer />
      </Suspense>
    </div>
  );
}

function TailSkeleton() {
  return (
    <Card className="flex h-full flex-col">
      <CardBody>
        <div className="mb-4 flex items-center gap-2 text-slate-400">
          <ScrollText className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm">Loading log viewer…</span>
        </div>
        <Skeleton variant="rectangular" className="h-[calc(100%-3rem)] w-full" />
      </CardBody>
    </Card>
  );
}
