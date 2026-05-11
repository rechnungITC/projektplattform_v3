"use client"

import { Skeleton } from "@/components/ui/skeleton"

interface DashboardSectionSkeletonProps {
  rows?: number
}

/**
 * PROJ-64 — generic section skeleton. Used by all panels while
 * the aggregation endpoint is in-flight.
 */
export function DashboardSectionSkeleton({
  rows = 3,
}: DashboardSectionSkeletonProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-md" />
      ))}
    </div>
  )
}
