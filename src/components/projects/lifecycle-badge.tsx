import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  LIFECYCLE_STATUS_LABELS,
  type LifecycleStatus,
} from "@/types/project"

interface LifecycleBadgeProps {
  status: LifecycleStatus
  className?: string
}

const STATUS_CLASSES: Record<LifecycleStatus, string> = {
  draft: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  active: "bg-emerald-600 text-white hover:bg-emerald-600/90 border-transparent",
  paused: "bg-amber-500 text-white hover:bg-amber-500/90 border-transparent",
  completed: "bg-blue-600 text-white hover:bg-blue-600/90 border-transparent",
  canceled:
    "bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent",
}

export function LifecycleBadge({ status, className }: LifecycleBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status], className)}
      aria-label={`Lifecycle status: ${LIFECYCLE_STATUS_LABELS[status]}`}
    >
      {LIFECYCLE_STATUS_LABELS[status]}
    </Badge>
  )
}
