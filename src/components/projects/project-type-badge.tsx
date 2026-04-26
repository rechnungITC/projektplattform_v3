import { Briefcase, Building2, Code2, Layers } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/types/project"

interface ProjectTypeBadgeProps {
  type: ProjectType
  className?: string
}

const TYPE_ICONS: Record<ProjectType, LucideIcon> = {
  erp: Briefcase,
  construction: Building2,
  software: Code2,
  general: Layers,
}

export function ProjectTypeBadge({ type, className }: ProjectTypeBadgeProps) {
  const Icon = TYPE_ICONS[type]
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", className)}
      aria-label={`Project type: ${PROJECT_TYPE_LABELS[type]}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {PROJECT_TYPE_LABELS[type]}
    </Badge>
  )
}
