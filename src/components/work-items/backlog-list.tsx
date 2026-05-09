"use client"

import { ChevronRight, MoreHorizontal } from "lucide-react"
import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useProjectAccess } from "@/hooks/use-project-access"
import {
  listWorkItemCostTotals,
  type WorkItemCostTotal,
} from "@/lib/cost/api"
import { cn } from "@/lib/utils"
import { isSprintAssignableKind } from "@/lib/work-items/sprint-assignment"
import type { Phase } from "@/types/phase"
import {
  WORK_ITEM_KIND_LABELS,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { useBacklogDndOptional } from "./backlog-dnd-provider"
import { DraggableWorkItemHandle } from "./draggable-story-handle"
import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemPriorityBadge } from "./work-item-priority-badge"
import { WorkItemStatusBadge } from "./work-item-status-badge"

interface BacklogListProps {
  projectId: string
  items: WorkItemWithProfile[]
  /** Phasen des Projekts — für die Phase-Spalte. Leeres Array bei Methoden ohne Phasen. */
  phases?: Phase[]
  loading: boolean
  onSelect: (id: string) => void
  onEditRequest: (item: WorkItemWithProfile) => void
  onChangeStatusRequest: (item: WorkItemWithProfile) => void
  onChangeParentRequest: (item: WorkItemWithProfile) => void
  onDeleteRequest: (item: WorkItemWithProfile) => void
  /** Multi-select state — controlled by parent (backlog-client). */
  selectedIds?: Set<string>
  onSelectionChange?: (next: Set<string>) => void
}

export function BacklogList({
  projectId,
  items,
  phases = [],
  loading,
  onSelect,
  onEditRequest,
  onChangeStatusRequest,
  onChangeParentRequest,
  onDeleteRequest,
  selectedIds,
  onSelectionChange,
}: BacklogListProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")

  // Build a quick map for parent breadcrumbs.
  const itemsById = React.useMemo(() => {
    const map = new Map<string, WorkItemWithProfile>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  // Phase-Lookup für die Phase-Spalte (id → "1. Initialisierung").
  const phaseById = React.useMemo(() => {
    const map = new Map<string, Phase>()
    for (const p of phases) map.set(p.id, p)
    return map
  }, [phases])

  const showPhaseColumn = phases.length > 0
  const selectionEnabled =
    selectedIds !== undefined && onSelectionChange !== undefined
  const allSelected =
    selectionEnabled && items.length > 0 && items.every((it) => selectedIds!.has(it.id))
  const someSelected =
    selectionEnabled && items.some((it) => selectedIds!.has(it.id)) && !allSelected

  const toggleAll = React.useCallback(() => {
    if (!selectionEnabled || !onSelectionChange) return
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(items.map((it) => it.id)))
    }
  }, [allSelected, items, onSelectionChange, selectionEnabled])

  const toggleOne = React.useCallback(
    (id: string) => {
      if (!selectionEnabled || !onSelectionChange) return
      const next = new Set(selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectionChange(next)
    },
    [onSelectionChange, selectedIds, selectionEnabled],
  )

  // PROJ-24 — Plan-Kosten pro Item, eine Batched-Fetch.
  const costsByItem = useWorkItemCostTotals(projectId, items.length)

  // PROJ-60 — DnD multi-select for sprint-assignable work items. Optional:
  // column only renders when a BacklogDndProvider is mounted above this list.
  const dnd = useBacklogDndOptional()
  const dndEnabled = dnd !== null

  if (loading) {
    return (
      <div role="status" aria-label="Lädt Work Items" className="space-y-2">
        {Array.from({ length: 5 }).map((_, idx) => (
          <Card key={idx}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Noch keine Work Items — leg das erste an.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {selectionEnabled ? (
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={() => toggleAll()}
                  aria-label="Alle auswählen"
                />
              </TableHead>
            ) : null}
            {dndEnabled ? (
              <TableHead className="w-10" aria-label="Verschieben" />
            ) : null}
            <TableHead className="w-32">Typ</TableHead>
            <TableHead>Titel</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-24">Priorität</TableHead>
            <TableHead className="w-44">Verantwortlich</TableHead>
            {showPhaseColumn ? (
              <TableHead className="w-40">Phase</TableHead>
            ) : null}
            <TableHead className="w-48">Übergeordnet</TableHead>
            <TableHead className="w-32 text-right">Plan-Kosten</TableHead>
            <TableHead className="w-12 text-right" aria-label="Aktionen" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const parent = item.parent_id ? itemsById.get(item.parent_id) : null
            const sprintAssignable = isSprintAssignableKind(item.kind)
            const dndSelected =
              dndEnabled && sprintAssignable ? dnd!.isSelected(item.id) : false
            return (
              <TableRow
                key={item.id}
                className={cn(
                  "cursor-pointer",
                  dndSelected && "bg-primary/5 ring-2 ring-inset ring-primary",
                )}
                onClick={(event) => {
                  // PROJ-60 — Ctrl/Cmd-Click toggles DnD selection,
                  // Shift-Click extends a range. Plain click keeps the
                  // existing "open detail drawer" behavior.
                  if (dndEnabled && sprintAssignable) {
                    if (event.ctrlKey || event.metaKey) {
                      event.preventDefault()
                      dnd!.toggle(item.id)
                      return
                    }
                    if (event.shiftKey) {
                      event.preventDefault()
                      dnd!.range(item.id, dnd!.orderedSprintAssignableIds)
                      return
                    }
                  }
                  onSelect(item.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(item.id)
                  }
                }}
                tabIndex={0}
                aria-label={`Work Item: ${item.title}`}
                aria-selected={dndSelected || undefined}
              >
                {selectionEnabled ? (
                  <TableCell
                    className="w-10"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds!.has(item.id)}
                      onCheckedChange={() => toggleOne(item.id)}
                      aria-label={`„${item.title}" auswählen`}
                    />
                  </TableCell>
                ) : null}
                {dndEnabled ? (
                  <TableCell
                    className="w-10"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {sprintAssignable ? (
                      <DraggableWorkItemHandle
                        workItemId={item.id}
                        workItemTitle={item.title}
                        workItemKind={item.kind}
                        selected={dndSelected}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell>
                  <WorkItemKindBadge kind={item.kind} />
                </TableCell>
                <TableCell className="max-w-md font-medium">
                  <span className="line-clamp-2 break-words">{item.title}</span>
                </TableCell>
                <TableCell>
                  <WorkItemStatusBadge status={item.status} />
                </TableCell>
                <TableCell>
                  <WorkItemPriorityBadge priority={item.priority} />
                </TableCell>
                <TableCell>
                  {item.responsible_user_id ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {(item.responsible_display_name ??
                            item.responsible_email ??
                            "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm">
                        {item.responsible_display_name ??
                          item.responsible_email ??
                          "—"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                {showPhaseColumn ? (
                  <TableCell>
                    {(() => {
                      const phase = item.phase_id
                        ? phaseById.get(item.phase_id)
                        : null
                      const label = phase
                        ? `${phase.sequence_number}. ${phase.name}`
                        : "—"
                      return (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onEditRequest(item)
                          }}
                          className="rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
                          title="Phase ändern"
                          aria-label={`Phase ${label} ändern`}
                        >
                          <span
                            className={
                              phase
                                ? "text-foreground"
                                : "text-muted-foreground"
                            }
                          >
                            {label}
                          </span>
                        </button>
                      )
                    })()}
                  </TableCell>
                ) : null}
                <TableCell>
                  {parent ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <WorkItemKindBadge kind={parent.kind} iconOnly />
                      <ChevronRight className="h-3 w-3" aria-hidden />
                      <span className="truncate">{parent.title}</span>
                    </div>
                  ) : item.parent_id ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <CostCell rows={costsByItem.get(item.id) ?? []} />
                </TableCell>
                <TableCell className="text-right">
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Aktionen für „${item.title}"`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-48"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            onEditRequest(item)
                          }}
                        >
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            onChangeStatusRequest(item)
                          }}
                        >
                          Status ändern
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            onChangeParentRequest(item)
                          }}
                        >
                          Übergeordnet ändern
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={(event) => {
                            event.preventDefault()
                            onDeleteRequest(item)
                          }}
                        >
                          Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <span className="sr-only">
                    Typ {WORK_ITEM_KIND_LABELS[item.kind]}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * PROJ-24 — fetch per-item cost-totals once per project, key by work_item_id.
 * Each work-item may have multiple rows in the view (one per currency).
 */
function useWorkItemCostTotals(
  projectId: string,
  itemCount: number
): Map<string, WorkItemCostTotal[]> {
  const [byItem, setByItem] = React.useState<Map<string, WorkItemCostTotal[]>>(
    () => new Map()
  )

  React.useEffect(() => {
    if (itemCount === 0) {
      setByItem(new Map())
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const totals = await listWorkItemCostTotals(projectId)
        if (cancelled) return
        const map = new Map<string, WorkItemCostTotal[]>()
        for (const t of totals) {
          const arr = map.get(t.work_item_id) ?? []
          arr.push(t)
          map.set(t.work_item_id, arr)
        }
        setByItem(map)
      } catch {
        // Cost-totals are an optional surface — fail silently to keep the
        // backlog functional even if the cost-stack errors.
        if (!cancelled) setByItem(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, itemCount])

  return byItem
}

interface CostCellProps {
  rows: WorkItemCostTotal[]
}

function CostCell({ rows }: CostCellProps) {
  // No cost-lines or all empty → "—"
  const meaningful = rows.filter(
    (r) => r.cost_lines_count > 0 && r.total_cost != null && r.currency != null
  )
  if (meaningful.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const isMultiCurrency = meaningful.length > 1
  const isEstimated = meaningful.some((r) => r.is_estimated)

  // Use the first row for the inline display (most-frequent currency from
  // the view); a tooltip lists all currency buckets.
  const primary = meaningful[0]
  const inline = (
    <span className="font-mono tabular-nums">
      {isEstimated ? "≈ " : ""}
      {formatCostAmount(Number(primary.total_cost))} {primary.currency}
    </span>
  )

  if (!isMultiCurrency && !isEstimated) {
    return inline
  }

  const tooltipLines: string[] = []
  if (isEstimated) {
    tooltipLines.push("Story-Point-basiert (geschätzt)")
  }
  if (isMultiCurrency) {
    tooltipLines.push("Mehrere Währungen:")
    for (const r of meaningful) {
      tooltipLines.push(
        `  ${formatCostAmount(Number(r.total_cost))} ${r.currency}`
      )
    }
    tooltipLines.push("(FX-Konvertierung in Reports)")
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help font-mono tabular-nums">
            {isEstimated ? "≈ " : ""}
            {isMultiCurrency
              ? `${meaningful.length}×`
              : formatCostAmount(Number(primary.total_cost))}{" "}
            {!isMultiCurrency ? primary.currency : ""}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">
          <div className="whitespace-pre text-xs">
            {tooltipLines.join("\n")}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function formatCostAmount(value: number): string {
  if (value >= 1_000_000) {
    return (value / 1_000_000).toLocaleString("de-DE", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + " M"
  }
  if (value >= 10_000) {
    return Math.round(value).toLocaleString("de-DE")
  }
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
