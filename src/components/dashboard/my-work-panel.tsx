"use client"

import { ChevronRight, Inbox, ListChecks } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkItemKindBadge } from "@/components/work-items/work-item-kind-badge"
import { cn } from "@/lib/utils"
import {
  MY_WORK_FILTERS,
  MY_WORK_FILTER_LABELS,
  type DashboardSectionEnvelope,
  type MyWorkFilter,
  type MyWorkRow,
} from "@/types/dashboard"
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_STATUS_LABELS,
  type WorkItemPriority,
  type WorkItemStatus,
} from "@/types/work-item"

import { DashboardSectionEmpty } from "./dashboard-section-empty"
import { DashboardSectionError } from "./dashboard-section-error"
import { DashboardSectionSkeleton } from "./dashboard-section-skeleton"
import { DashboardSectionUnavailable } from "./dashboard-section-unavailable"

interface MyWorkPanelProps {
  envelope: DashboardSectionEnvelope<{
    items: MyWorkRow[]
    total: number
    capped: boolean
  }>
  isLoading: boolean
  onRetry: () => void | Promise<void>
}

/**
 * PROJ-64 AC-2 — My Work Inbox.
 *
 * Filter chips: overdue, due soon, blocked, in progress, all.
 * Each row deep-links into the existing project / work-item
 * surface via `MyWorkRow.href` (built server-side so the FE
 * never needs to know about per-method routing).
 */
export function MyWorkPanel({
  envelope,
  isLoading,
  onRetry,
}: MyWorkPanelProps) {
  const [filter, setFilter] = React.useState<MyWorkFilter>("all")

  const items = React.useMemo(
    () => envelope.data?.items ?? [],
    [envelope.data?.items],
  )
  const filtered = React.useMemo(
    () => filterRows(items, filter),
    [items, filter],
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden />
          My Work
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          {envelope.state === "ready" && envelope.data
            ? `${envelope.data.total} ${envelope.data.total === 1 ? "Item" : "Items"}${envelope.data.capped ? " (gekappt)" : ""}`
            : null}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <FilterChips active={filter} onChange={setFilter} items={items} />
        <Body
          isLoading={isLoading}
          envelope={envelope}
          filtered={filtered}
          onRetry={onRetry}
        />
      </CardContent>
    </Card>
  )
}

function Body({
  isLoading,
  envelope,
  filtered,
  onRetry,
}: {
  isLoading: boolean
  envelope: MyWorkPanelProps["envelope"]
  filtered: MyWorkRow[]
  onRetry: () => void | Promise<void>
}) {
  if (isLoading || envelope.state === "loading") {
    return <DashboardSectionSkeleton rows={4} />
  }
  if (envelope.state === "error") {
    return (
      <DashboardSectionError
        title="My Work"
        message={envelope.error}
        onRetry={onRetry}
      />
    )
  }
  if (envelope.state === "unavailable") {
    return (
      <DashboardSectionUnavailable
        title="My Work wird vorbereitet"
        description="Die globale Aggregation der zugewiesenen Items wird in der Backend-Slice von PROJ-64 aktiviert."
      />
    )
  }
  if (filtered.length === 0) {
    return (
      <DashboardSectionEmpty
        icon={Inbox}
        title="Keine offenen Items"
        description="Wenn dir Tasks, Stories oder Bugs zugewiesen werden, erscheinen sie hier."
      />
    )
  }
  return (
    <ul className="space-y-2">
      {filtered.map((row) => (
        <MyWorkRowItem key={row.work_item_id} row={row} />
      ))}
    </ul>
  )
}

function FilterChips({
  active,
  onChange,
  items,
}: {
  active: MyWorkFilter
  onChange: (next: MyWorkFilter) => void
  items: MyWorkRow[]
}) {
  const counts = React.useMemo(() => countByFilter(items), [items])
  return (
    <div className="flex flex-wrap gap-1.5">
      {MY_WORK_FILTERS.map((f) => {
        const count = counts[f]
        const isActive = f === active
        return (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={isActive ? "default" : "outline"}
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => onChange(f)}
            aria-pressed={isActive}
          >
            {MY_WORK_FILTER_LABELS[f]}
            <span
              className={cn(
                "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

function MyWorkRowItem({ row }: { row: MyWorkRow }) {
  return (
    <li>
      <Link
        href={row.href}
        className="group flex items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent"
      >
        <WorkItemKindBadge kind={row.kind} iconOnly className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {row.project_name}
            </span>
            {row.is_overdue && (
              <Badge variant="destructive" className="h-5 text-[10px]">
                Überfällig
              </Badge>
            )}
            {row.is_blocked && (
              <Badge
                variant="outline"
                className="h-5 border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
              >
                Blockiert
              </Badge>
            )}
          </div>
          <p className="truncate text-sm font-medium text-foreground">
            {row.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{WORK_ITEM_STATUS_LABELS[row.status]}</span>
            <span>·</span>
            <span>
              Priorität: {priorityLabel(row.priority)}
            </span>
            {row.due_date ? (
              <>
                <span>·</span>
                <span>Fällig: {formatDate(row.due_date)}</span>
              </>
            ) : (
              <>
                <span>·</span>
                <span>Kein Termin</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  )
}

function priorityLabel(p: WorkItemPriority): string {
  return WORK_ITEM_PRIORITY_LABELS[p]
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

const DUE_SOON_DAYS = 7

function isDueSoon(row: MyWorkRow, todayMs: number): boolean {
  if (!row.due_date || row.is_overdue) return false
  const target = new Date(row.due_date).getTime()
  if (Number.isNaN(target)) return false
  const days = Math.ceil((target - todayMs) / (1000 * 60 * 60 * 24))
  return days <= DUE_SOON_DAYS && days >= 0
}

function isInProgress(row: MyWorkRow): boolean {
  return matchesStatus(row.status, "in_progress")
}

function matchesStatus(status: WorkItemStatus, target: WorkItemStatus): boolean {
  return status === target
}

function filterRows(rows: MyWorkRow[], f: MyWorkFilter): MyWorkRow[] {
  if (f === "all") return rows
  const todayMs = Date.now()
  switch (f) {
    case "overdue":
      return rows.filter((r) => r.is_overdue)
    case "due_soon":
      return rows.filter((r) => isDueSoon(r, todayMs))
    case "blocked":
      return rows.filter((r) => r.is_blocked || r.status === "blocked")
    case "in_progress":
      return rows.filter(isInProgress)
    default:
      return rows
  }
}

function countByFilter(rows: MyWorkRow[]): Record<MyWorkFilter, number> {
  const todayMs = Date.now()
  return {
    all: rows.length,
    overdue: rows.filter((r) => r.is_overdue).length,
    due_soon: rows.filter((r) => isDueSoon(r, todayMs)).length,
    blocked: rows.filter((r) => r.is_blocked || r.status === "blocked").length,
    in_progress: rows.filter(isInProgress).length,
  }
}
