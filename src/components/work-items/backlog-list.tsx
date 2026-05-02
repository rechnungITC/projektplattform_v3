"use client"

import { ChevronRight, MoreHorizontal } from "lucide-react"
import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  WORK_ITEM_KIND_LABELS,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemPriorityBadge } from "./work-item-priority-badge"
import { WorkItemStatusBadge } from "./work-item-status-badge"

interface BacklogListProps {
  projectId: string
  items: WorkItemWithProfile[]
  loading: boolean
  onSelect: (id: string) => void
  onEditRequest: (item: WorkItemWithProfile) => void
  onChangeStatusRequest: (item: WorkItemWithProfile) => void
  onChangeParentRequest: (item: WorkItemWithProfile) => void
  onDeleteRequest: (item: WorkItemWithProfile) => void
}

export function BacklogList({
  projectId,
  items,
  loading,
  onSelect,
  onEditRequest,
  onChangeStatusRequest,
  onChangeParentRequest,
  onDeleteRequest,
}: BacklogListProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")

  // Build a quick map for parent breadcrumbs.
  const itemsById = React.useMemo(() => {
    const map = new Map<string, WorkItemWithProfile>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  // PROJ-24 — Plan-Kosten pro Item, eine Batched-Fetch.
  const costsByItem = useWorkItemCostTotals(projectId, items.length)

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
            <TableHead className="w-32">Typ</TableHead>
            <TableHead>Titel</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-24">Priorität</TableHead>
            <TableHead className="w-44">Verantwortlich</TableHead>
            <TableHead className="w-48">Übergeordnet</TableHead>
            <TableHead className="w-32 text-right">Plan-Kosten</TableHead>
            <TableHead className="w-12 text-right" aria-label="Aktionen" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const parent = item.parent_id ? itemsById.get(item.parent_id) : null
            return (
              <TableRow
                key={item.id}
                className="cursor-pointer"
                onClick={() => onSelect(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(item.id)
                  }
                }}
                tabIndex={0}
                aria-label={`Work Item: ${item.title}`}
              >
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
