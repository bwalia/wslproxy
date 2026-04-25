import Card, { CardBody, CardHeader } from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Skeleton shown by the `<Suspense>` boundary while
 * `WelcomeBannerServer` is streaming in.  Matches the two-column
 * banner layout so the visual jump when content arrives is minimal.
 *
 * Uses named `CardBody` / `CardHeader` imports because RSC strips
 * compound-component properties at the server/client boundary — the
 * `Card.Body` shorthand would be `undefined` here.
 */
export default function WelcomeBannerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card className="flex h-full flex-col bg-linear-to-br from-primary-600 to-primary-800 text-white">
          <CardBody className="flex flex-1 flex-col justify-center">
            <Skeleton className="mb-3 h-6 w-24 bg-white/20" />
            <Skeleton className="mb-2 h-8 w-72 bg-white/20" />
            <Skeleton className="mb-6 h-16 w-full bg-white/10" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-32 bg-white/20" />
              <Skeleton className="h-10 w-20 bg-white/10" />
            </div>
          </CardBody>
        </Card>
      </div>
      <div>
        <Card className="h-full">
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
