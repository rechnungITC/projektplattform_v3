import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // Stable hook for tests to tell "still loading" from "loaded" (PROJ-Y-143b
      // AC-5). Anchoring on `.animate-pulse` instead would be wrong twice over:
      // permanent pulsing elements exist (sprint-card live dot, trajectory
      // badges), and `cn`'s tailwind-merge lets a caller's `rounded-full` drop
      // `rounded-md`, so a class-based selector is not dependable either.
      // Matches what upstream shadcn/ui does; no styling or behaviour change.
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
