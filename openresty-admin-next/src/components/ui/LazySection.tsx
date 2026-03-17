"use client";

import { Suspense, type ReactNode } from "react";
import { useInView } from "@/hooks/useInView";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

interface LazySectionProps {
  children: ReactNode;
  height?: string;
  rootMargin?: string;
}

/**
 * Defers rendering until the element scrolls near the viewport.
 * Prevents API calls for off-screen dashboard sections on initial load.
 */
export default function LazySection({
  children,
  height = "h-64",
  rootMargin = "200px",
}: LazySectionProps) {
  const { ref, inView } = useInView(rootMargin);

  return (
    <div ref={ref}>
      {inView ? (
        <Suspense
          fallback={
            <Card>
              <Card.Body>
                <Skeleton variant="rectangular" className={`w-full ${height}`} />
              </Card.Body>
            </Card>
          }
        >
          {children}
        </Suspense>
      ) : (
        <div className={height} />
      )}
    </div>
  );
}
