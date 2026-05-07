import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  WORK_ITEM_STATUS_LABELS,
  type WorkItemStatus,
} from "@/types/work-item"

interface WorkItemStatusBadgeProps {
  status: WorkItemStatus
  className?: string
}

// PROJ-51-γ.6 — `done` migrated to --success token (per-mode tuned).
const STATUS_CLASSES: Record<WorkItemStatus, string> = {
  todo: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  in_progress:
    "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
  blocked:
    "bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent",
  done: "bg-success/15 text-success border-success/30 hover:bg-success/20",
  cancelled:
    "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent line-through",
}

export function WorkItemStatusBadge({
  status,
  className,
}: WorkItemStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status], className)}
      aria-label={`Status: ${WORK_ITEM_STATUS_LABELS[status]}`}
    >
      {WORK_ITEM_STATUS_LABELS[status]}
    </Badge>
  )
}
