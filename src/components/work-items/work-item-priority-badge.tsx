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

const PRIORITY_CLASSES: Record<WorkItemPriority, string> = {
  low: "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
  medium:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent",
  high: "bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
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
