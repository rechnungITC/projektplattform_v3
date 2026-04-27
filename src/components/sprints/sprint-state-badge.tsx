import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SPRINT_STATE_LABELS, type SprintState } from "@/types/sprint"

interface SprintStateBadgeProps {
  state: SprintState
  className?: string
}

const STATE_CLASSES: Record<SprintState, string> = {
  planned: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  active:
    "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
  closed:
    "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
}

export function SprintStateBadge({ state, className }: SprintStateBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(STATE_CLASSES[state], className)}
      aria-label={`Sprint-Status: ${SPRINT_STATE_LABELS[state]}`}
    >
      {SPRINT_STATE_LABELS[state]}
    </Badge>
  )
}
