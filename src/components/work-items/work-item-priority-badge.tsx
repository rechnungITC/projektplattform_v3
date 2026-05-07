import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  WORK_ITEM_PRIORITY_LABELS,
  type WorkItemPriority,
} from "@/types/work-item"

interface WorkItemPriorityBadgeProps {
  priority: WorkItemPriority
  className?: string
}

// PROJ-51-γ.6 — `high` migrated to --warning token; dark:variants konsolidiert.
const PRIORITY_CLASSES: Record<WorkItemPriority, string> = {
  low: "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
  medium:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent",
  high: "bg-warning/15 text-warning border-warning/30 hover:bg-warning/20",
  critical:
    "bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent",
}

export function WorkItemPriorityBadge({
  priority,
  className,
}: WorkItemPriorityBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs", PRIORITY_CLASSES[priority], className)}
      aria-label={`Priorität: ${WORK_ITEM_PRIORITY_LABELS[priority]}`}
    >
      {WORK_ITEM_PRIORITY_LABELS[priority]}
    </Badge>
  )
}
