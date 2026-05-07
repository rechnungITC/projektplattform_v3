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

// PROJ-51-γ.6 — semantic-token-bound (per-mode adapt). draft = secondary,
// active = success, paused = warning, completed = info, canceled = destructive.
const STATUS_CLASSES: Record<LifecycleStatus, string> = {
  draft: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  active: "bg-success/15 text-success border-success/30 hover:bg-success/20",
  paused: "bg-warning/15 text-warning border-warning/30 hover:bg-warning/20",
  completed: "bg-info/15 text-info border-info/30 hover:bg-info/20",
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
