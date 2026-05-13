"use client"

import { CalendarDays } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { WorkItemPriorityBadge } from "@/components/work-items/work-item-priority-badge"
import { WorkItemStatusBadge } from "@/components/work-items/work-item-status-badge"
import { cn } from "@/lib/utils"
import {
  RELEASE_DATE_SOURCE_LABELS,
  type ProjectReleaseSummary,
  type ReleaseTimelineItem,
} from "@/types/release"
import { WORK_ITEM_KIND_LABELS } from "@/types/work-item"

interface ReleaseStoryGanttProps {
  summary: ProjectReleaseSummary
}

const ROW_HEIGHT = 42
const HEADER_HEIGHT = 44
const PX_PER_DAY = 18
const PADDING_X = 18

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
  const copy = new Date(value.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function daysBetween(a: string, b: string): number {
  const delta = parseDate(b).getTime() - parseDate(a).getTime()
  return Math.round(delta / 86_400_000)
}

function collectDates(summary: ProjectReleaseSummary): string[] {
  const dates: string[] = []
  if (summary.release.start_date) dates.push(summary.release.start_date)
  if (summary.release.end_date) dates.push(summary.release.end_date)
  for (const item of summary.items) {
    if (item.timeline_start) dates.push(item.timeline_start)
    if (item.timeline_end) dates.push(item.timeline_end)
  }
  for (const sprint of summary.sprint_contributions) {
    if (sprint.start_date) dates.push(sprint.start_date)
    if (sprint.end_date) dates.push(sprint.end_date)
  }
  for (const phase of summary.phases) {
    if (phase.planned_start) dates.push(phase.planned_start)
    if (phase.planned_end) dates.push(phase.planned_end)
  }
  for (const milestone of summary.milestones) {
    if (milestone.target_date) dates.push(milestone.target_date)
  }
  return dates
}

function chartBounds(summary: ProjectReleaseSummary): {
  start: string
  end: string
  days: number
} {
  const dates = collectDates(summary).sort()
  if (dates.length === 0) {
    const today = new Date()
    const start = toIsoDate(addDays(today, -7))
    const end = toIsoDate(addDays(today, 21))
    return { start, end, days: daysBetween(start, end) + 1 }
  }
  const min = toIsoDate(addDays(parseDate(dates[0] as string), -3))
  const max = toIsoDate(addDays(parseDate(dates[dates.length - 1] as string), 3))
  return { start: min, end: max, days: daysBetween(min, max) + 1 }
}

function orderRows(items: ReleaseTimelineItem[]): ReleaseTimelineItem[] {
  const childrenByParent = new Map<string, ReleaseTimelineItem[]>()
  const roots: ReleaseTimelineItem[] = []

  for (const item of items) {
    if (item.parent_id) {
      const children = childrenByParent.get(item.parent_id) ?? []
      children.push(item)
      childrenByParent.set(item.parent_id, children)
    } else {
      roots.push(item)
    }
  }

  const compare = (a: ReleaseTimelineItem, b: ReleaseTimelineItem) => {
    const aDate = a.timeline_start ?? "9999-12-31"
    const bDate = b.timeline_start ?? "9999-12-31"
    if (aDate !== bDate) return aDate.localeCompare(bDate)
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind)
    return a.title.localeCompare(b.title)
  }

  const ordered: ReleaseTimelineItem[] = []
  for (const root of roots.sort(compare)) {
    ordered.push(root)
    for (const child of (childrenByParent.get(root.id) ?? []).sort(compare)) {
      ordered.push(child)
    }
  }

  for (const item of items.filter((row) => row.parent_id && !ordered.includes(row)).sort(compare)) {
    ordered.push(item)
  }
  return ordered
}

function barClass(item: ReleaseTimelineItem): string {
  if (item.blocked) return "fill-destructive"
  if (item.critical) return "fill-warning"
  if (item.outside_release_window) return "fill-amber-500"
  if (item.kind === "story") return "fill-primary"
  if (item.kind === "bug") return "fill-rose-500"
  return "fill-sky-500"
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "ohne Datum"
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(parseDate(value))
}

export function ReleaseStoryGantt({ summary }: ReleaseStoryGanttProps) {
  const rows = orderRows(summary.items)
  const bounds = chartBounds(summary)
  const timelineWidth = Math.max(760, bounds.days * PX_PER_DAY + PADDING_X * 2)
  const chartHeight = HEADER_HEIGHT + Math.max(rows.length, 1) * ROW_HEIGHT
  const xFor = (date: string) =>
    PADDING_X + daysBetween(bounds.start, date) * PX_PER_DAY
  const wFor = (start: string, end: string) =>
    Math.max(PX_PER_DAY, (daysBetween(start, end) + 1) * PX_PER_DAY)

  const ticks: string[] = []
  const tickStep = bounds.days > 120 ? 30 : bounds.days > 60 ? 14 : 7
  for (let day = 0; day <= bounds.days; day += tickStep) {
    ticks.push(toIsoDate(addDays(parseDate(bounds.start), day)))
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-md border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Story-Gantt
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Noch keine Stories, Tasks oder Bugs in diesem Release.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-md border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Story-Gantt
        </div>
        <Badge variant="secondary">{rows.length} Items</Badge>
      </div>

      <div className="grid overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border-r bg-muted/20">
          <div className="flex h-[44px] items-center border-b px-4 text-xs font-medium uppercase text-muted-foreground">
            Scope
          </div>
          {rows.map((item) => (
            <div
              key={item.id}
              className="flex h-[42px] items-center gap-2 border-b px-4"
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm font-medium",
                  item.parent_id ? "pl-5 text-muted-foreground" : ""
                )}
                title={item.title}
              >
                {item.title}
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {WORK_ITEM_KIND_LABELS[item.kind]}
              </Badge>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <svg
            role="img"
            aria-label="Release Story Timeline"
            width={timelineWidth}
            height={chartHeight}
            viewBox={`0 0 ${timelineWidth} ${chartHeight}`}
            className="block"
          >
            <rect
              x="0"
              y="0"
              width={timelineWidth}
              height={chartHeight}
              className="fill-background"
            />

            {ticks.map((tick) => {
              const x = xFor(tick)
              return (
                <g key={tick}>
                  <line
                    x1={x}
                    x2={x}
                    y1={HEADER_HEIGHT}
                    y2={chartHeight}
                    className="stroke-border"
                    strokeWidth="1"
                  />
                  <text
                    x={x + 4}
                    y="26"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {formatDate(tick)}
                  </text>
                </g>
              )
            })}

            {summary.release.start_date && summary.release.end_date ? (
              <rect
                x={xFor(summary.release.start_date)}
                y={HEADER_HEIGHT}
                width={wFor(summary.release.start_date, summary.release.end_date)}
                height={Math.max(0, rows.length * ROW_HEIGHT - 1)}
                rx="6"
                className="fill-primary/5 stroke-primary/30"
                strokeWidth="1"
              />
            ) : null}

            {summary.sprint_contributions.map((sprint) => {
              if (!sprint.start_date || !sprint.end_date) return null
              return (
                <rect
                  key={sprint.sprint_id}
                  x={xFor(sprint.start_date)}
                  y={HEADER_HEIGHT}
                  width={wFor(sprint.start_date, sprint.end_date)}
                  height={Math.max(0, rows.length * ROW_HEIGHT - 1)}
                  className="fill-sky-500/5"
                >
                  <title>{sprint.name}</title>
                </rect>
              )
            })}

            {summary.milestones.map((milestone) => {
              if (!milestone.target_date) return null
              const x = xFor(milestone.target_date)
              return (
                <g key={milestone.id}>
                  <line
                    x1={x}
                    x2={x}
                    y1={HEADER_HEIGHT}
                    y2={chartHeight}
                    className="stroke-warning/50"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <rect
                    x={x - 5}
                    y="33"
                    width="10"
                    height="10"
                    className="fill-warning"
                    transform={`rotate(45 ${x} 38)`}
                  >
                    <title>{milestone.name}</title>
                  </rect>
                </g>
              )
            })}

            {rows.map((item, index) => {
              const y = HEADER_HEIGHT + index * ROW_HEIGHT + 11
              if (!item.timeline_start || !item.timeline_end) {
                return (
                  <g key={item.id}>
                    <line
                      x1={PADDING_X}
                      x2={timelineWidth - PADDING_X}
                      y1={y + 9}
                      y2={y + 9}
                      className="stroke-muted"
                      strokeDasharray="3 6"
                    />
                    <text
                      x={PADDING_X + 8}
                      y={y + 4}
                      className="fill-muted-foreground text-[11px]"
                    >
                      Nicht geplant
                    </text>
                  </g>
                )
              }
              return (
                <g key={item.id}>
                  <rect
                    x={xFor(item.timeline_start)}
                    y={y}
                    width={wFor(item.timeline_start, item.timeline_end)}
                    height="18"
                    rx="5"
                    className={barClass(item)}
                  >
                    <title>
                      {`${item.title}: ${formatDate(item.timeline_start)} - ${formatDate(
                        item.timeline_end
                      )}`}
                    </title>
                  </rect>
                  {item.outside_release_window ? (
                    <circle
                      cx={
                        xFor(item.timeline_start) +
                        wFor(item.timeline_start, item.timeline_end) +
                        7
                      }
                      cy={y + 9}
                      r="4"
                      className="fill-amber-500"
                    />
                  ) : null}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t px-4 py-3">
        {rows.slice(0, 8).map((item) => (
          <div key={item.id} className="flex items-center gap-1">
            <WorkItemStatusBadge status={item.status} />
            <WorkItemPriorityBadge priority={item.priority} />
            <Badge variant="outline" className="text-xs">
              {RELEASE_DATE_SOURCE_LABELS[item.date_source]}
            </Badge>
          </div>
        ))}
      </div>
    </section>
  )
}
