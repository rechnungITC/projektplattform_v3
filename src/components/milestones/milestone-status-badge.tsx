import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  MILESTONE_STATUS_LABELS,
  type MilestoneStatus,
} from "@/types/milestone"

interface MilestoneStatusBadgeProps {
  status: MilestoneStatus
  className?: string
}

// PROJ-51-γ.2 — `achieved` migrated to --success token.
const STATUS_CLASSES: Record<MilestoneStatus, string> = {
  planned: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  achieved: "bg-success/15 text-success border-success/30 hover:bg-success/20",
  missed:
    "bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent",
  cancelled:
    "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent line-through",
}

export function MilestoneStatusBadge({
  status,
  className,
}: MilestoneStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status], className)}
      aria-label={`Meilensteinstatus: ${MILESTONE_STATUS_LABELS[status]}`}
    >
      {MILESTONE_STATUS_LABELS[status]}
    </Badge>
  )
}
