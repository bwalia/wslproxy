import Card, { CardHeader, CardBody } from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Suspense fallback for <HealthPanels />.  Rendered server-side; streams
 * to the browser as plain HTML while the backend call is in flight.
 */
export default function HealthPanelsSkeleton() {
  return (
    <>
      <Skeleton variant="rectangular" className="mb-6 h-16 w-full" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton variant="text" className="h-6 w-32" />
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                <Skeleton variant="text" className="h-4 w-full" />
                <Skeleton variant="text" className="h-4 w-5/6" />
                <Skeleton variant="text" className="h-4 w-4/6" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
