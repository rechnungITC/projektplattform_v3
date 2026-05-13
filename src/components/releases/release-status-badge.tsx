import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  PROJECT_RELEASE_STATUS_LABELS,
  type ProjectReleaseStatus,
} from "@/types/release"

interface ReleaseStatusBadgeProps {
  status: ProjectReleaseStatus
  className?: string
}

const STATUS_CLASSES: Record<ProjectReleaseStatus, string> = {
  planned: "bg-secondary text-secondary-foreground border-transparent",
  active: "bg-primary text-primary-foreground border-transparent",
  released: "bg-success/15 text-success border-success/30",
  archived: "bg-muted text-muted-foreground border-transparent",
}

export function ReleaseStatusBadge({
  status,
  className,
}: ReleaseStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status], className)}
      aria-label={`Release-Status: ${PROJECT_RELEASE_STATUS_LABELS[status]}`}
    >
      {PROJECT_RELEASE_STATUS_LABELS[status]}
    </Badge>
  )
}
