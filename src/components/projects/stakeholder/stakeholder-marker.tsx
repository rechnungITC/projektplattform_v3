"use client"

/**
 * PROJ-65 ε.2 — StakeholderMarker (FE-1..FE-4, FE-17, FE-18).
 *
 * Avatar-Stack at the bottom-right slot of a TrajectoryNode. Visible
 * markers carry an accent ring (critical / positive / cost-flagged /
 * neutral); overflow is a `+N` counter. All targets are at least
 * 32×32 to honour Apple HIG / Android Material touch sizing.
 *
 * Rendered as HTML overlay on top of the SVG canvas in
 * `trajectory-graph-2d.tsx`; same component is reused as a billboard
 * sprite in 3D when ε.2's 3D-marker slice lands.
 */

import { AlertTriangle, Euro } from "lucide-react"
import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { NodeAssignee } from "@/lib/project-graph/types"

interface StakeholderMarkerProps {
  assignees: NodeAssignee[]
  /** Display budget when shrunken (mobile). Defaults to desktop (3 visible). */
  maxVisible?: number
  onClickAssignee: (assignee: NodeAssignee) => void
  onClickOverflow: () => void
  /**
   * PROJ-65 ε.2 — when true, the marker stack pulses a dashed amber
   * border for ~3 s as a visual receipt of the transient swap action
   * (FE-13 / F-PROJ-65-17). Parent controls timing.
   */
  showReceipt?: boolean
}

function severityRank(a: NodeAssignee): number {
  if (a.is_critical) return 0
  if (a.is_cost_flagged) return 1
  if (a.is_positive) return 2
  return 3
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Deterministic ring colour fallback when assignee carries no accent. */
function fallbackBg(name: string): string {
  const palette = [
    "bg-slate-500",
    "bg-zinc-500",
    "bg-stone-500",
    "bg-gray-500",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

interface StakeholderMarkerItemProps {
  assignee: NodeAssignee
  onClick: () => void
}

function StakeholderMarkerItem({
  assignee,
  onClick,
}: StakeholderMarkerItemProps) {
  const ringClass = assignee.is_critical
    ? "ring-2 ring-red-500"
    : assignee.is_positive
      ? "ring-2 ring-primary"
      : "ring-1 ring-border"

  const ariaLabel = [
    assignee.name,
    assignee.role,
    assignee.is_critical ? "kritisch" : null,
    assignee.is_positive ? "positiv" : null,
    assignee.is_cost_flagged ? "kostenkritisch" : null,
    assignee.deleted_at ? "nicht mehr verfügbar" : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          data-testid="stakeholder-marker-item"
          className={`relative inline-flex h-8 w-8 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
            assignee.deleted_at ? "opacity-50" : ""
          }`}
        >
          <Avatar className={`h-6 w-6 ${ringClass}`}>
            <AvatarFallback
              className={`text-[10px] font-semibold text-white ${fallbackBg(assignee.name)}`}
            >
              {initials(assignee.name)}
            </AvatarFallback>
          </Avatar>
          {assignee.is_critical && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
            >
              <AlertTriangle className="h-2 w-2" />
            </span>
          )}
          {assignee.is_cost_flagged && !assignee.is_critical && (
            <span
              aria-hidden
              className="absolute -bottom-0.5 -left-0.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
            >
              <Euro className="h-2 w-2" />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span className="font-medium">{assignee.name}</span>
        {assignee.role && (
          <span className="ml-1 text-muted-foreground">· {assignee.role}</span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function StakeholderMarker({
  assignees,
  maxVisible = 3,
  onClickAssignee,
  onClickOverflow,
  showReceipt = false,
}: StakeholderMarkerProps) {
  // FE-3 — sort: critical → cost-flagged → positive → neutral.
  // Soft-deleted last (greyed out, still tappable for context).
  const ordered = React.useMemo(() => {
    return [...assignees].sort((a, b) => {
      if (Boolean(a.deleted_at) !== Boolean(b.deleted_at)) {
        return a.deleted_at ? 1 : -1
      }
      return severityRank(a) - severityRank(b)
    })
  }, [assignees])

  if (ordered.length === 0) return null

  const visible = ordered.slice(0, maxVisible)
  const overflow = Math.max(0, ordered.length - maxVisible)

  return (
    <div
      className={`pointer-events-auto inline-flex items-center -space-x-2 rounded-full p-0.5 transition-colors ${
        showReceipt
          ? "border-2 border-dashed border-amber-500 bg-amber-500/10 shadow-[0_0_0_2px_rgba(245,158,11,0.15)]"
          : "border-2 border-transparent"
      }`}
      data-testid="stakeholder-marker-stack"
      data-receipt={showReceipt ? "true" : undefined}
    >
      {visible.map((a) => (
        <StakeholderMarkerItem
          key={`${a.work_item_id}:${a.resource_id}`}
          assignee={a}
          onClick={() => onClickAssignee(a)}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={onClickOverflow}
          aria-label={`weitere ${overflow} Stakeholder anzeigen`}
          data-testid="stakeholder-marker-overflow"
          className="relative ml-1 inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-muted px-2 text-[10px] font-semibold text-foreground ring-1 ring-border hover:bg-muted/80"
        >
          +{overflow > 99 ? "99+" : overflow}
        </button>
      )}
    </div>
  )
}
