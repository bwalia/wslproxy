import Card, { CardHeader, CardBody } from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

export default function SettingsPanelsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton variant="text" className="h-6 w-40" />
      </CardHeader>
      <CardBody>
        <div className="space-y-3">
          <Skeleton variant="text" className="h-4 w-full" />
          <Skeleton variant="text" className="h-4 w-5/6" />
          <Skeleton variant="text" className="h-4 w-4/6" />
          <Skeleton variant="text" className="h-4 w-5/6" />
        </div>
      </CardBody>
    </Card>
  );
}
