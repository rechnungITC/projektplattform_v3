import {
  BookOpen,
  Box,
  Bug,
  CheckSquare,
  Flag,
  Layers,
  ListChecks,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { WORK_ITEM_KIND_LABELS, type WorkItemKind } from "@/types/work-item"

interface WorkItemKindBadgeProps {
  kind: WorkItemKind
  className?: string
  /** When true, only the icon is rendered (compact placement). */
  iconOnly?: boolean
}

const KIND_ICONS: Record<WorkItemKind, LucideIcon> = {
  epic: Layers,
  feature: Flag,
  story: BookOpen,
  task: CheckSquare,
  subtask: ListChecks,
  bug: Bug,
  work_package: Box,
}

const KIND_CLASSES: Record<WorkItemKind, string> = {
  epic: "bg-purple-100 text-purple-900 hover:bg-purple-100 border-purple-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-900",
  feature:
    "bg-indigo-100 text-indigo-900 hover:bg-indigo-100 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-900",
  story:
    "bg-sky-100 text-sky-900 hover:bg-sky-100 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900",
  task: "bg-teal-100 text-teal-900 hover:bg-teal-100 border-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-900",
  subtask:
    "bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
  bug: "bg-rose-100 text-rose-900 hover:bg-rose-100 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900",
  work_package:
    "bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900",
}

export function WorkItemKindBadge({
  kind,
  className,
  iconOnly = false,
}: WorkItemKindBadgeProps) {
  const Icon = KIND_ICONS[kind]
  const label = WORK_ITEM_KIND_LABELS[kind]
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        KIND_CLASSES[kind],
        className
      )}
      aria-label={`Typ: ${label}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {iconOnly ? <span className="sr-only">{label}</span> : label}
    </Badge>
  )
}
