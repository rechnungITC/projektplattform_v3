import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PHASE_STATUS_LABELS, type PhaseStatus } from "@/types/phase"

interface PhaseStatusBadgeProps {
  status: PhaseStatus
  className?: string
}

// PROJ-51-γ.2 — `completed` migrated to --success token (semantic alias of
// --risk-low). Other states keep their shadcn semantic tokens.
const STATUS_CLASSES: Record<PhaseStatus, string> = {
  planned: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  in_progress:
    "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
  completed: "bg-success/15 text-success border-success/30 hover:bg-success/20",
  cancelled:
    "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent line-through",
}

export function PhaseStatusBadge({ status, className }: PhaseStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status], className)}
      aria-label={`Phasenstatus: ${PHASE_STATUS_LABELS[status]}`}
    >
      {PHASE_STATUS_LABELS[status]}
    </Badge>
  )
}
