import Card, { CardHeader, CardBody } from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Suspense fallback for `<HealthPanels />`.  Mirrors the live grid so
 * the layout doesn't shift when real data arrives — 10 half-width
 * panel placeholders plus one full-width panel for the Data
 * Directories table.  Rendered server-side; streams to the browser
 * as plain HTML while the backend call is in flight.
 */
export default function HealthPanelsSkeleton() {
  return (
    <>
      {/* Overall status banner */}
      <Skeleton variant="rectangular" className="mb-6 h-20 w-full" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <PanelPlaceholder key={i} />
        ))}
        <div className="lg:col-span-2">
          <PanelPlaceholder tall />
        </div>
      </div>
    </>
  );
}

/**
 * Single-panel skeleton used by both the half-width grid cells and
 * the full-width Data Directories row.  `tall` is only taller, not
 * structurally different — avoids a second component just for one
 * variation.
 */
function PanelPlaceholder({ tall = false }: { tall?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton variant="text" className="h-4 w-32" />
      </CardHeader>
      <CardBody>
        <div className={`space-y-2 ${tall ? "pb-8" : ""}`}>
          {Array.from({ length: tall ? 6 : 4 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton variant="text" className="h-3 w-24" />
              <Skeleton variant="text" className="h-3 w-32" />
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
