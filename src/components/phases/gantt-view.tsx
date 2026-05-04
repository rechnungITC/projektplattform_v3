"use client"

/**
 * PROJ-25 Stage 1 — Date-based Gantt-view for phases.
 *
 * Pure SVG, React-19-native. No external library (SVAR currently
 * incompatible with React 19; ADR follow-up keeps the door open to
 * switch later when wx-react-gantt v2 lands).
 *
 * What this component does:
 *   - Renders one row per phase, ordered by sequence_number.
 *   - Each phase becomes a bar from planned_start → planned_end.
 *   - The whole bar can be dragged horizontally (move): planned_start
 *     and planned_end shift by the same number of days.
 *   - The right edge has a 6 px resize-grip: drag right/left to extend
 *     or shrink planned_end only.
 *   - Snap-to-day-grid (1-day minimum increment); minimum duration 1 day.
 *   - Live preview during drag; PATCH on mouseUp.
 *   - Phases without dates are listed but not drawn (no bar).
 *   - Completed phases are read-only (status = 'completed' shows a 🔒).
 *
 * Out of scope (Stage 2+):
 *   - Milestones, work_packages, dependency arrows, critical path,
 *     phase-container drag-with-children, cross-project indicators,
 *     touch-DnD, undo. All reserved for PROJ-25-β / γ.
 */

import { Lock } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { type Milestone, MILESTONE_STATUS_LABELS } from "@/types/milestone"
import { PHASE_STATUS_LABELS, type Phase } from "@/types/phase"

interface PhaseDependency {
  id: string
  from_id: string
  to_id: string
  constraint_type: "FS" | "SS" | "FF" | "SF"
}

interface GanttViewProps {
  projectId: string
  phases: Phase[]
  milestones: Milestone[]
  canEdit: boolean
  onChanged: () => void
}

const ROW_HEIGHT = 36
const ROW_GAP = 4
const HEADER_HEIGHT = 32
const PIXELS_PER_DAY = 16
const PADDING_DAYS = 7
const RESIZE_HANDLE_WIDTH = 6

interface DragState {
  phaseId: string
  mode: "move" | "resize"
  startX: number
  origStart: Date
  origEnd: Date
  // Live deltas while dragging; flushed to API on mouseUp.
  deltaDays: number
}

function toDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / 86_400_000)
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

export function GanttView({
  projectId,
  phases,
  milestones,
  canEdit,
  onChanged,
}: GanttViewProps) {
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [submitting, setSubmitting] = React.useState<string | null>(null)
  const [dependencies, setDependencies] = React.useState<PhaseDependency[]>([])
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Phase-to-phase dependency edges (Stage 2 read-only).
  // Polymorphic table supports project/phase/work_package/todo — for now
  // we render only edges whose both ends are 'phase' so the arrows match
  // the bars on screen.
  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/dependencies`)
        if (!res.ok) return
        const data = await res.json()
        const rows = Array.isArray(data?.dependencies) ? data.dependencies : []
        if (cancelled) return
        const phaseEdges: PhaseDependency[] = rows
          .filter(
            (r: { from_type?: string; to_type?: string }) =>
              r.from_type === "phase" && r.to_type === "phase",
          )
          .map(
            (r: {
              id: string
              from_id: string
              to_id: string
              constraint_type: PhaseDependency["constraint_type"]
            }) => ({
              id: r.id,
              from_id: r.from_id,
              to_id: r.to_id,
              constraint_type: r.constraint_type,
            }),
          )
        setDependencies(phaseEdges)
      } catch {
        // silent — Gantt still renders without arrows.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, phases])

  // Compute the calendar window from all phase dates, pad each side.
  const { calendarStart, totalDays } = React.useMemo(() => {
    const dates: Date[] = []
    for (const p of phases) {
      const ps = toDate(p.planned_start)
      const pe = toDate(p.planned_end)
      if (ps) dates.push(ps)
      if (pe) dates.push(pe)
    }
    if (dates.length === 0) {
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      return {
        calendarStart: addDays(today, -PADDING_DAYS),
        totalDays: 60,
      }
    }
    const min = new Date(Math.min(...dates.map((d) => d.getTime())))
    const max = new Date(Math.max(...dates.map((d) => d.getTime())))
    min.setUTCHours(0, 0, 0, 0)
    max.setUTCHours(0, 0, 0, 0)
    return {
      calendarStart: addDays(min, -PADDING_DAYS),
      totalDays: daysBetween(min, max) + PADDING_DAYS * 2,
    }
  }, [phases])

  const totalWidth = totalDays * PIXELS_PER_DAY
  const totalHeight = HEADER_HEIGHT + phases.length * (ROW_HEIGHT + ROW_GAP)

  // Month-label ticks across the calendar window.
  const monthTicks = React.useMemo(() => {
    const ticks: { x: number; label: string }[] = []
    const cursor = new Date(calendarStart.getTime())
    cursor.setUTCDate(1)
    while (daysBetween(calendarStart, cursor) < totalDays) {
      const days = daysBetween(calendarStart, cursor)
      if (days >= 0) {
        ticks.push({
          x: days * PIXELS_PER_DAY,
          label: cursor.toLocaleDateString("de-DE", {
            month: "short",
            year: "2-digit",
          }),
        })
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    return ticks
  }, [calendarStart, totalDays])

  const dayGridLines = React.useMemo(() => {
    const lines: number[] = []
    for (let d = 0; d <= totalDays; d += 7) {
      lines.push(d * PIXELS_PER_DAY)
    }
    return lines
  }, [totalDays])

  // Pre-compute the static layout of each phase bar (no drag delta applied)
  // so dependency arrows + milestones can position themselves without
  // duplicating the math inside the bar-render block.
  const phaseLayout = React.useMemo(() => {
    const m = new Map<
      string,
      { x: number; y: number; width: number; midY: number }
    >()
    phases.forEach((phase, idx) => {
      const ps = toDate(phase.planned_start)
      const pe = toDate(phase.planned_end)
      if (!ps || !pe) return
      const rowY = HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)
      const x = daysBetween(calendarStart, ps) * PIXELS_PER_DAY
      const width = Math.max(
        PIXELS_PER_DAY,
        daysBetween(ps, pe) * PIXELS_PER_DAY,
      )
      m.set(phase.id, {
        x,
        y: rowY + 4,
        width,
        midY: rowY + ROW_HEIGHT / 2,
      })
    })
    return m
  }, [phases, calendarStart])

  const onMouseDown = (
    e: React.MouseEvent<SVGRectElement | SVGGElement>,
    phase: Phase,
    mode: "move" | "resize",
  ) => {
    if (!canEdit) return
    if (phase.status === "completed") return
    const ps = toDate(phase.planned_start)
    const pe = toDate(phase.planned_end)
    if (!ps || !pe) return
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      phaseId: phase.id,
      mode,
      startX: e.clientX,
      origStart: ps,
      origEnd: pe,
      deltaDays: 0,
    })
  }

  React.useEffect(() => {
    if (!drag) return

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.startX
      const deltaDays = Math.round(dx / PIXELS_PER_DAY)
      if (deltaDays === drag.deltaDays) return
      setDrag((prev) => (prev ? { ...prev, deltaDays } : null))
    }

    const onUp = async () => {
      // Capture before resetting state.
      const finalDelta = drag.deltaDays
      const phaseId = drag.phaseId
      const mode = drag.mode
      const orig = { start: drag.origStart, end: drag.origEnd }
      setDrag(null)

      if (finalDelta === 0) return

      let newStart = orig.start
      let newEnd = orig.end
      if (mode === "move") {
        newStart = addDays(orig.start, finalDelta)
        newEnd = addDays(orig.end, finalDelta)
      } else {
        // resize — only end moves; enforce 1-day minimum.
        newEnd = addDays(orig.end, finalDelta)
        if (daysBetween(orig.start, newEnd) < 1) {
          newEnd = addDays(orig.start, 1)
        }
      }

      setSubmitting(phaseId)
      try {
        const res = await fetch(
          `/api/projects/${projectId}/phases/${phaseId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              planned_start: toIsoDate(newStart),
              planned_end: toIsoDate(newEnd),
            }),
          },
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.message ?? `HTTP ${res.status}`)
        }
        toast.success("Phase aktualisiert")
        onChanged()
      } catch (err) {
        toast.error("Aktualisierung fehlgeschlagen", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
        onChanged() // refresh anyway to revert optimistic state
      } finally {
        setSubmitting(null)
      }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [drag, projectId, onChanged])

  if (phases.length === 0) {
    return (
      <div
        role="status"
        className="flex w-full items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 py-8 text-sm text-muted-foreground"
      >
        Noch keine Phasen — Gantt wird sichtbar sobald die erste Phase angelegt ist.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto rounded-md border bg-card"
      role="region"
      aria-label="Gantt-Diagramm der Phasen"
    >
      <svg
        width={totalWidth}
        height={totalHeight}
        className="block min-w-full select-none"
      >
        {/* Day-grid weeklies */}
        {dayGridLines.map((x, i) => (
          <line
            key={`grid-${i}`}
            x1={x}
            x2={x}
            y1={HEADER_HEIGHT}
            y2={totalHeight}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
            opacity={0.3}
          />
        ))}

        {/* Month-tick header */}
        <rect
          x={0}
          y={0}
          width={totalWidth}
          height={HEADER_HEIGHT}
          className="fill-muted/50"
        />
        {monthTicks.map((t, i) => (
          <g key={`tick-${i}`}>
            <line
              x1={t.x}
              x2={t.x}
              y1={0}
              y2={HEADER_HEIGHT}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
            />
            <text
              x={t.x + 4}
              y={HEADER_HEIGHT / 2 + 4}
              className="fill-foreground"
              fontSize={11}
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Phase rows */}
        {phases.map((phase, idx) => {
          const ps = toDate(phase.planned_start)
          const pe = toDate(phase.planned_end)
          const rowY = HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)

          if (!ps || !pe) {
            return (
              <g key={phase.id} aria-label={phase.name}>
                <rect
                  x={0}
                  y={rowY}
                  width={totalWidth}
                  height={ROW_HEIGHT}
                  className="fill-muted/20"
                />
                <text
                  x={8}
                  y={rowY + ROW_HEIGHT / 2 + 4}
                  fontSize={12}
                  className="fill-muted-foreground italic"
                >
                  {phase.sequence_number}. {phase.name} — keine Daten gepflegt
                </text>
              </g>
            )
          }

          // Apply live drag delta visually.
          const isDragging = drag?.phaseId === phase.id
          const startDays = daysBetween(calendarStart, ps)
          const durationDays = daysBetween(ps, pe)
          let x = startDays * PIXELS_PER_DAY
          let width = durationDays * PIXELS_PER_DAY
          if (isDragging && drag) {
            if (drag.mode === "move") {
              x += drag.deltaDays * PIXELS_PER_DAY
            } else {
              width = Math.max(
                PIXELS_PER_DAY,
                width + drag.deltaDays * PIXELS_PER_DAY,
              )
            }
          }

          const locked = phase.status === "completed"
          const draggable = canEdit && !locked

          return (
            <g
              key={phase.id}
              aria-label={`Phase ${phase.sequence_number}: ${phase.name} – ${PHASE_STATUS_LABELS[phase.status]}`}
            >
              {idx % 2 === 1 ? (
                <rect
                  x={0}
                  y={rowY}
                  width={totalWidth}
                  height={ROW_HEIGHT}
                  className="fill-muted/20"
                />
              ) : null}

              {/* Bar */}
              <rect
                x={x}
                y={rowY + 4}
                width={width}
                height={ROW_HEIGHT - 8}
                rx={4}
                className={cn(
                  barClasses(phase.status),
                  draggable ? "cursor-grab" : "cursor-default",
                  isDragging && "opacity-80 shadow-lg",
                  submitting === phase.id && "animate-pulse",
                )}
                onMouseDown={(e) => onMouseDown(e, phase, "move")}
              />

              {/* Resize handle (right edge) — only if draggable */}
              {draggable ? (
                <rect
                  x={x + width - RESIZE_HANDLE_WIDTH}
                  y={rowY + 4}
                  width={RESIZE_HANDLE_WIDTH}
                  height={ROW_HEIGHT - 8}
                  className="fill-foreground/30 cursor-col-resize"
                  onMouseDown={(e) => onMouseDown(e, phase, "resize")}
                />
              ) : null}

              {/* Label inside or beside the bar */}
              <text
                x={x + 8}
                y={rowY + ROW_HEIGHT / 2 + 4}
                fontSize={12}
                fontWeight={500}
                className={cn(
                  "pointer-events-none",
                  width > 80
                    ? "fill-primary-foreground"
                    : "fill-foreground",
                )}
              >
                {locked ? "🔒 " : ""}
                {phase.sequence_number}. {phase.name}
              </text>

              {locked ? (
                <Lock
                  x={x + width + 4}
                  y={rowY + ROW_HEIGHT / 2 - 6}
                  className="text-muted-foreground"
                  width={12}
                  height={12}
                />
              ) : null}
            </g>
          )
        })}

        {/* Milestone diamonds — positioned at target_date within their
            phase row. Orphan milestones (no phase_id or phase not in
            view) are quietly skipped for Stage 2; a future slice can
            add a dedicated bottom row. */}
        {milestones.map((m) => {
          if (!m.phase_id) return null
          const layout = phaseLayout.get(m.phase_id)
          if (!layout) return null
          const td = toDate(m.target_date)
          if (!td) return null
          const x = daysBetween(calendarStart, td) * PIXELS_PER_DAY
          const cy = layout.midY
          const size = 8
          return (
            <g
              key={`ms-${m.id}`}
              aria-label={`Meilenstein ${m.name} – ${MILESTONE_STATUS_LABELS[m.status]}`}
            >
              <polygon
                points={`${x},${cy - size} ${x + size},${cy} ${x},${cy + size} ${x - size},${cy}`}
                className={milestoneFill(m.status)}
                strokeWidth={1.5}
              />
              <title>
                {m.name} · {new Date(m.target_date).toLocaleDateString("de-DE")}
                {m.status === "achieved" ? " · erreicht" : ""}
                {m.status === "missed" ? " · verpasst" : ""}
              </title>
            </g>
          )
        })}

        {/* Phase-to-phase dependency arrows. FS = right-edge of from
            connects to left-edge of to. Other constraint types render
            with the same path for now (constraint_type label visible
            in the title tooltip); polish in PROJ-25 Stage 3. */}
        <defs>
          <marker
            id="gantt-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground/70" />
          </marker>
        </defs>
        {dependencies.map((dep) => {
          const from = phaseLayout.get(dep.from_id)
          const to = phaseLayout.get(dep.to_id)
          if (!from || !to) return null
          const x1 = from.x + from.width
          const y1 = from.midY
          const x2 = to.x
          const y2 = to.midY
          // Smooth bezier with horizontal control points scaled by gap.
          const dx = Math.max(20, Math.abs(x2 - x1) / 2)
          const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
          return (
            <g key={`dep-${dep.id}`}>
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-foreground/60"
                markerEnd="url(#gantt-arrow)"
              />
              <title>
                Dependency {dep.constraint_type} · von Phase nach Phase
              </title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function milestoneFill(status: Milestone["status"]): string {
  switch (status) {
    case "achieved":
      return "fill-emerald-600 stroke-emerald-700"
    case "missed":
      return "fill-destructive stroke-destructive"
    case "cancelled":
      return "fill-muted stroke-muted-foreground/50"
    case "planned":
    default:
      return "fill-amber-500 stroke-amber-700"
  }
}

function barClasses(status: Phase["status"]): string {
  switch (status) {
    case "in_progress":
      return "fill-primary stroke-primary"
    case "completed":
      return "fill-emerald-600 stroke-emerald-600"
    case "cancelled":
      return "fill-muted stroke-muted-foreground/40"
    case "planned":
    default:
      return "fill-blue-500/70 stroke-blue-700"
  }
}
