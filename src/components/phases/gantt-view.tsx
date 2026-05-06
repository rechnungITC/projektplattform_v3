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

import {
  bottomTicks as buildBottomTicks,
  gridLines as buildGridLines,
  headerConfigFor,
  topTicks as buildTopTicks,
  weekendBands as buildWeekendBands,
} from "@/lib/dates/gantt-timeline"
import { cn } from "@/lib/utils"
import { type Milestone, MILESTONE_STATUS_LABELS } from "@/types/milestone"
import { PHASE_STATUS_LABELS, type Phase } from "@/types/phase"
import type { WorkItemWithProfile } from "@/types/work-item"

type LinkType = "phase" | "work_package"

interface PolymorphicDependency {
  id: string
  from_type: LinkType
  from_id: string
  to_type: LinkType
  to_id: string
  constraint_type: "FS" | "SS" | "FF" | "SF"
}

interface GanttViewProps {
  projectId: string
  phases: Phase[]
  milestones: Milestone[]
  /** PROJ-25 Stage 5 — work_items with kind='work_package' for the project. */
  workPackages?: WorkItemWithProfile[]
  canEdit: boolean
  onChanged: () => void
  /**
   * Optional — called when the user clicks a WP-Bar (or a placeholder for a
   * WP without dates). The parent should open the edit-dialog so the user
   * can pencil in planned_start / planned_end. Without dates the bar is
   * just a grey band, and the link-drag-hotspot is missing → user can
   * neither see the WP on the timeline nor wire dependencies.
   */
  onEditWorkItemRequest?: (item: WorkItemWithProfile) => void
}

const ROW_HEIGHT = 36
const ROW_GAP = 4
// PROJ-53: two-tier header — top + bottom row each 24 px.
const TOP_HEADER_HEIGHT = 24
const BOTTOM_HEADER_HEIGHT = 24
const HEADER_HEIGHT = TOP_HEADER_HEIGHT + BOTTOM_HEADER_HEIGHT
const PADDING_DAYS = 7
const RESIZE_HANDLE_WIDTH = 6

// Zoom-Levels — Pixel-pro-Tag-Faktor.
// PROJ-53 bumps day-zoom from 32 → 40 to fit "1 Mo" labels comfortably.
type ZoomLevel = "day" | "week" | "month" | "quarter"
const ZOOM_PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 40,
  week: 16,
  month: 6,
  quarter: 2,
}
const ZOOM_LABELS: Record<ZoomLevel, string> = {
  day: "Tag",
  week: "Woche",
  month: "Monat",
  quarter: "Quartal",
}

type DragState =
  | {
      kind: "phase"
      phaseId: string
      mode: "move" | "resize"
      startX: number
      origStart: Date
      origEnd: Date
      deltaDays: number
    }
  | {
      kind: "workpackage"
      workPackageId: string
      mode: "move" | "resize"
      startX: number
      origStart: Date
      origEnd: Date
      deltaDays: number
    }
  | {
      kind: "milestone"
      milestoneId: string
      startX: number
      origDate: Date
      deltaDays: number
    }
  | {
      kind: "link"
      fromType: LinkType
      fromId: string
      mouseX: number
      mouseY: number
      targetType: LinkType | null
      targetId: string | null
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
  workPackages = [],
  canEdit,
  onChanged,
  onEditWorkItemRequest,
}: GanttViewProps) {
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [submitting, setSubmitting] = React.useState<string | null>(null)
  const [dependencies, setDependencies] = React.useState<PolymorphicDependency[]>([])
  const [zoomLevel, setZoomLevel] = React.useState<ZoomLevel>("week")
  const pixelsPerDay = ZOOM_PIXELS_PER_DAY[zoomLevel]
  const [criticalPhaseIds, setCriticalPhaseIds] = React.useState<Set<string>>(
    new Set(),
  )
  const [criticalPathOn, setCriticalPathOn] = React.useState(false)
  const [criticalPathLoading, setCriticalPathLoading] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)

  // Fetch the critical-path phase set when the toggle flips on, or when
  // the underlying phase/dep set changes while it's already on.
  React.useEffect(() => {
    if (!criticalPathOn || !projectId) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag for async fetch
    setCriticalPathLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/critical-path`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as { phase_ids: string[] }
        if (cancelled) return
        setCriticalPhaseIds(new Set(body.phase_ids ?? []))
      } catch {
        if (!cancelled) setCriticalPhaseIds(new Set())
      } finally {
        if (!cancelled) setCriticalPathLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [criticalPathOn, projectId, phases, dependencies])

  // Polymorphic dependency edges between phase + work_package bars.
  // Stage 5 broadens the filter from phase-only to phase OR work_package
  // so the arrows can connect both kinds of bars on screen.
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
        const supported: PolymorphicDependency[] = rows
          .filter(
            (r: { from_type?: string; to_type?: string }) =>
              (r.from_type === "phase" || r.from_type === "work_package") &&
              (r.to_type === "phase" || r.to_type === "work_package"),
          )
          .map(
            (r: {
              id: string
              from_type: LinkType
              from_id: string
              to_type: LinkType
              to_id: string
              constraint_type: PolymorphicDependency["constraint_type"]
            }) => ({
              id: r.id,
              from_type: r.from_type,
              from_id: r.from_id,
              to_type: r.to_type,
              to_id: r.to_id,
              constraint_type: r.constraint_type,
            }),
          )
        setDependencies(supported)
      } catch {
        // silent — Gantt still renders without arrows.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, phases, workPackages])

  // Group work-packages by their parent phase. Orphan WPs (no phase_id
  // or phase not in the phase list) get bucketed under the synthetic
  // key "__unphased__" and render at the end.
  const ORPHAN_BUCKET = "__unphased__"
  const wpsByPhase = React.useMemo(() => {
    const map = new Map<string, WorkItemWithProfile[]>()
    const phaseIds = new Set(phases.map((p) => p.id))
    for (const wp of workPackages) {
      if (wp.is_deleted) continue
      const key =
        wp.phase_id && phaseIds.has(wp.phase_id) ? wp.phase_id : ORPHAN_BUCKET
      const list = map.get(key) ?? []
      list.push(wp)
      map.set(key, list)
    }
    return map
  }, [workPackages, phases])

  // Compute the calendar window from phase + work-package dates, pad each side.
  const { calendarStart, totalDays } = React.useMemo(() => {
    const dates: Date[] = []
    for (const p of phases) {
      const ps = toDate(p.planned_start)
      const pe = toDate(p.planned_end)
      if (ps) dates.push(ps)
      if (pe) dates.push(pe)
    }
    for (const wp of workPackages) {
      const ps = toDate(wp.planned_start ?? null)
      const pe = toDate(wp.planned_end ?? null)
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
  }, [phases, workPackages])

  // Build the row list — each phase followed by its work-packages, then
  // any orphan WPs at the end. Each item gets a stable rowIndex used by
  // the bar-render and layout maps below.
  type Row =
    | { kind: "phase"; phase: Phase; rowIndex: number }
    | {
        kind: "work_package"
        item: WorkItemWithProfile
        rowIndex: number
      }
  const rows: Row[] = React.useMemo(() => {
    const out: Row[] = []
    let idx = 0
    for (const phase of phases) {
      out.push({ kind: "phase", phase, rowIndex: idx++ })
      const children = wpsByPhase.get(phase.id) ?? []
      for (const wp of children) {
        out.push({ kind: "work_package", item: wp, rowIndex: idx++ })
      }
    }
    for (const wp of wpsByPhase.get(ORPHAN_BUCKET) ?? []) {
      out.push({ kind: "work_package", item: wp, rowIndex: idx++ })
    }
    return out
  }, [phases, wpsByPhase])

  const totalWidth = totalDays * pixelsPerDay
  const totalHeight = HEADER_HEIGHT + rows.length * (ROW_HEIGHT + ROW_GAP)

  // Month-label ticks across the calendar window.
  // PROJ-53 — MS-Project-Style timeline scale:
  //  - top-row major ticks (month / quarter / year per zoom)
  //  - bottom-row minor ticks (day / week / month / quarter per zoom)
  //  - weekend bands (only in day + week zoom)
  //  - grid lines (density per zoom)
  const headerConfig = headerConfigFor(zoomLevel)

  const topTicks = React.useMemo(
    () => buildTopTicks(zoomLevel, calendarStart, totalDays, pixelsPerDay),
    [zoomLevel, calendarStart, totalDays, pixelsPerDay],
  )

  const bottomTicks = React.useMemo(
    () => buildBottomTicks(zoomLevel, calendarStart, totalDays, pixelsPerDay),
    [zoomLevel, calendarStart, totalDays, pixelsPerDay],
  )

  const weekendBands = React.useMemo(
    () =>
      headerConfig.showWeekends
        ? buildWeekendBands(calendarStart, totalDays, pixelsPerDay)
        : [],
    [headerConfig.showWeekends, calendarStart, totalDays, pixelsPerDay],
  )

  const gridLineXs = React.useMemo(
    () => buildGridLines(zoomLevel, calendarStart, totalDays, pixelsPerDay),
    [zoomLevel, calendarStart, totalDays, pixelsPerDay],
  )

  // Pre-compute the static layout of each bar (phase + work_package).
  // Keyed by `${type}:${id}` so arrows + critical-path + milestone code
  // can resolve any endpoint regardless of kind. A view-only `phaseLayout`
  // map is derived from it for the existing milestone positioning code.
  const barLayout = React.useMemo(() => {
    const m = new Map<
      string,
      { x: number; y: number; width: number; midY: number }
    >()
    rows.forEach((row) => {
      const rowY = HEADER_HEIGHT + row.rowIndex * (ROW_HEIGHT + ROW_GAP)
      let ps: Date | null = null
      let pe: Date | null = null
      let key: string
      if (row.kind === "phase") {
        ps = toDate(row.phase.planned_start)
        pe = toDate(row.phase.planned_end)
        key = `phase:${row.phase.id}`
      } else {
        ps = toDate(row.item.planned_start ?? null)
        pe = toDate(row.item.planned_end ?? null)
        key = `work_package:${row.item.id}`
      }
      if (!ps || !pe) return
      const x = daysBetween(calendarStart, ps) * pixelsPerDay
      const width = Math.max(
        pixelsPerDay,
        daysBetween(ps, pe) * pixelsPerDay,
      )
      m.set(key, {
        x,
        y: rowY + 4,
        width,
        midY: rowY + ROW_HEIGHT / 2,
      })
    })
    return m
  }, [rows, calendarStart, pixelsPerDay])

  // Phase-only view used by the milestone block.
  const phaseLayout = React.useMemo(() => {
    const m = new Map<
      string,
      { x: number; y: number; width: number; midY: number }
    >()
    for (const [key, layout] of barLayout) {
      if (key.startsWith("phase:")) {
        m.set(key.slice("phase:".length), layout)
      }
    }
    return m
  }, [barLayout])

  const startPhaseDrag = (
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
      kind: "phase",
      phaseId: phase.id,
      mode,
      startX: e.clientX,
      origStart: ps,
      origEnd: pe,
      deltaDays: 0,
    })
  }

  const startWorkPackageDrag = (
    e: React.MouseEvent<SVGRectElement | SVGGElement>,
    wp: WorkItemWithProfile,
    mode: "move" | "resize",
  ) => {
    if (!canEdit) return
    const ps = toDate(wp.planned_start ?? null)
    const pe = toDate(wp.planned_end ?? null)
    if (!ps || !pe) return
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      kind: "workpackage",
      workPackageId: wp.id,
      mode,
      startX: e.clientX,
      origStart: ps,
      origEnd: pe,
      deltaDays: 0,
    })
  }

  const startMilestoneDrag = (
    e: React.MouseEvent<SVGElement>,
    milestone: Milestone,
  ) => {
    if (!canEdit) return
    if (milestone.status === "achieved" || milestone.status === "cancelled") return
    const td = toDate(milestone.target_date)
    if (!td) return
    e.preventDefault()
    e.stopPropagation()
    setDrag({
      kind: "milestone",
      milestoneId: milestone.id,
      startX: e.clientX,
      origDate: td,
      deltaDays: 0,
    })
  }

  const startLinkDrag = (
    e: React.MouseEvent<SVGElement>,
    fromType: LinkType,
    fromId: string,
  ) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    const svg = (e.currentTarget.ownerSVGElement ?? e.currentTarget) as SVGSVGElement
    const rect = svg.getBoundingClientRect()
    setDrag({
      kind: "link",
      fromType,
      fromId,
      mouseX: e.clientX - rect.left,
      mouseY: e.clientY - rect.top,
      targetType: null,
      targetId: null,
    })
  }

  React.useEffect(() => {
    if (!drag) return

    const onMove = (e: MouseEvent) => {
      if (
        drag.kind === "phase" ||
        drag.kind === "milestone" ||
        drag.kind === "workpackage"
      ) {
        const dx = e.clientX - drag.startX
        const deltaDays = Math.round(dx / pixelsPerDay)
        if (deltaDays === drag.deltaDays) return
        setDrag((prev) => (prev ? { ...prev, deltaDays } : null))
        return
      }
      if (drag.kind === "link") {
        const svg = svgRef.current
        const targetEl = document.elementFromPoint(e.clientX, e.clientY)
        let targetType: LinkType | null = null
        let targetId: string | null = null
        if (targetEl instanceof Element) {
          const node = targetEl.closest<SVGElement>("[data-bar-target]")
          const raw = node?.getAttribute("data-bar-target") ?? null
          if (raw) {
            const colon = raw.indexOf(":")
            if (colon > 0) {
              const t = raw.slice(0, colon) as LinkType
              const id = raw.slice(colon + 1)
              if (
                (t === "phase" || t === "work_package") &&
                !(t === drag.fromType && id === drag.fromId)
              ) {
                targetType = t
                targetId = id
              }
            }
          }
        }
        if (svg) {
          const rect = svg.getBoundingClientRect()
          setDrag((prev) =>
            prev && prev.kind === "link"
              ? {
                  ...prev,
                  mouseX: e.clientX - rect.left,
                  mouseY: e.clientY - rect.top,
                  targetType,
                  targetId,
                }
              : prev,
          )
        }
      }
    }

    const onUp = async () => {
      const snapshot = drag
      setDrag(null)

      if (snapshot.kind === "phase") {
        if (snapshot.deltaDays === 0) return
        let newStart = snapshot.origStart
        let newEnd = snapshot.origEnd
        if (snapshot.mode === "move") {
          newStart = addDays(snapshot.origStart, snapshot.deltaDays)
          newEnd = addDays(snapshot.origEnd, snapshot.deltaDays)
        } else {
          newEnd = addDays(snapshot.origEnd, snapshot.deltaDays)
          if (daysBetween(snapshot.origStart, newEnd) < 1) {
            newEnd = addDays(snapshot.origStart, 1)
          }
        }
        setSubmitting(snapshot.phaseId)
        try {
          const res = await fetch(
            `/api/projects/${projectId}/phases/${snapshot.phaseId}`,
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
          // Phase-Container "mitziehen": when MOVING (not resizing), shift
          // every child milestone by the same number of days.
          if (snapshot.mode === "move") {
            const childMilestones = milestones.filter(
              (m) => m.phase_id === snapshot.phaseId,
            )
            await Promise.all(
              childMilestones.map((m) => {
                const td = toDate(m.target_date)
                if (!td) return Promise.resolve()
                const shifted = addDays(td, snapshot.deltaDays)
                return fetch(
                  `/api/projects/${projectId}/milestones/${m.id}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ target_date: toIsoDate(shifted) }),
                  },
                ).catch(() => undefined)
              }),
            )
          }
          toast.success("Phase aktualisiert")
          onChanged()
        } catch (err) {
          toast.error("Aktualisierung fehlgeschlagen", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
          onChanged()
        } finally {
          setSubmitting(null)
        }
        return
      }

      if (snapshot.kind === "workpackage") {
        if (snapshot.deltaDays === 0) return
        let newStart = snapshot.origStart
        let newEnd = snapshot.origEnd
        if (snapshot.mode === "move") {
          newStart = addDays(snapshot.origStart, snapshot.deltaDays)
          newEnd = addDays(snapshot.origEnd, snapshot.deltaDays)
        } else {
          newEnd = addDays(snapshot.origEnd, snapshot.deltaDays)
          if (daysBetween(snapshot.origStart, newEnd) < 1) {
            newEnd = addDays(snapshot.origStart, 1)
          }
        }
        setSubmitting(snapshot.workPackageId)
        try {
          const res = await fetch(
            `/api/projects/${projectId}/work-items/${snapshot.workPackageId}`,
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
          toast.success("Arbeitspaket aktualisiert")
          onChanged()
        } catch (err) {
          toast.error("Aktualisierung fehlgeschlagen", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
          onChanged()
        } finally {
          setSubmitting(null)
        }
        return
      }

      if (snapshot.kind === "milestone") {
        if (snapshot.deltaDays === 0) return
        const newDate = addDays(snapshot.origDate, snapshot.deltaDays)
        setSubmitting(snapshot.milestoneId)
        try {
          const res = await fetch(
            `/api/projects/${projectId}/milestones/${snapshot.milestoneId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ target_date: toIsoDate(newDate) }),
            },
          )
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err?.message ?? `HTTP ${res.status}`)
          }
          toast.success("Meilenstein verschoben")
          onChanged()
        } catch (err) {
          toast.error("Verschieben fehlgeschlagen", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
          onChanged()
        } finally {
          setSubmitting(null)
        }
        return
      }

      if (snapshot.kind === "link") {
        if (!snapshot.targetType || !snapshot.targetId) return
        if (
          snapshot.targetType === snapshot.fromType &&
          snapshot.targetId === snapshot.fromId
        ) {
          return
        }
        try {
          const res = await fetch(
            `/api/projects/${projectId}/dependencies`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                from_type: snapshot.fromType,
                from_id: snapshot.fromId,
                to_type: snapshot.targetType,
                to_id: snapshot.targetId,
                constraint_type: "FS",
              }),
            },
          )
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error(err?.message ?? `HTTP ${res.status}`)
          }
          toast.success("Dependency erstellt")
          onChanged()
        } catch (err) {
          toast.error("Dependency-Erstellung fehlgeschlagen", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
        }
      }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [drag, projectId, milestones, onChanged, pixelsPerDay])

  // Delete a dependency edge by clicking the arrow.
  const handleDeleteDependency = React.useCallback(
    async (depId: string, label: string) => {
      if (!canEdit) return
      if (!window.confirm(`Abhängigkeit „${label}" löschen?`)) return
      try {
        const res = await fetch(
          `/api/projects/${projectId}/dependencies/${depId}`,
          { method: "DELETE" },
        )
        if (!res.ok && res.status !== 204) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.message ?? `HTTP ${res.status}`)
        }
        toast.success("Abhängigkeit gelöscht")
        onChanged()
      } catch (err) {
        toast.error("Abhängigkeit konnte nicht gelöscht werden", {
          description: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    },
    [canEdit, projectId, onChanged],
  )

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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Zoom — 4 Levels (Tag → Quartal). Aktive Stufe als gefüllter
            Button, andere als outline. */}
        <div
          role="group"
          aria-label="Zoom-Level"
          className="inline-flex overflow-hidden rounded-md border"
        >
          {(["day", "week", "month", "quarter"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoomLevel(level)}
              aria-pressed={zoomLevel === level}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors",
                zoomLevel === level
                  ? "bg-foreground text-background"
                  : "bg-background hover:bg-accent",
              )}
            >
              {ZOOM_LABELS[level]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCriticalPathOn((on) => !on)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            criticalPathOn
              ? "border-destructive bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "border-border bg-background hover:bg-accent",
          )}
          aria-pressed={criticalPathOn}
          aria-label="Kritischen Pfad ein-/ausblenden"
        >
          <span
            aria-hidden
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              criticalPathOn ? "bg-destructive" : "bg-muted-foreground/40",
            )}
          />
          Kritischer Pfad
          {criticalPathOn && criticalPathLoading ? " …" : null}
          {criticalPathOn && !criticalPathLoading && criticalPhaseIds.size > 0
            ? ` · ${criticalPhaseIds.size}`
            : null}
        </button>
      </div>
      <div
        className="flex rounded-md border bg-card"
        role="region"
        aria-label="Gantt-Diagramm der Phasen"
      >
        {/* Left fixed table column — name + dates per row.
            OpenProject-style split: items stay visible even without bars. */}
        <div className="w-72 shrink-0 border-r">
          <div
            style={{ height: HEADER_HEIGHT }}
            className="flex items-center gap-2 border-b bg-muted/50 px-3 text-xs font-medium text-muted-foreground"
          >
            <span className="flex-1">Name</span>
            <span className="w-20 text-right">Start</span>
            <span className="w-20 text-right">Ende</span>
          </div>
          {rows.map((row, idx) => {
            const isPhase = row.kind === "phase"
            const ps = isPhase ? row.phase.planned_start : row.item.planned_start
            const pe = isPhase ? row.phase.planned_end : row.item.planned_end
            const label = isPhase
              ? `${row.phase.sequence_number}. ${row.phase.name}`
              : row.item.title
            const onClick = !isPhase && onEditWorkItemRequest
              ? () => onEditWorkItemRequest!(row.item)
              : undefined
            return (
              <div
                key={isPhase ? `phase-${row.phase.id}` : `wp-${row.item.id}`}
                style={{ height: ROW_HEIGHT + ROW_GAP }}
                className={cn(
                  "flex items-center gap-2 border-b border-border/40 px-3 text-xs",
                  idx % 2 === 1 && "bg-muted/15",
                  !isPhase && "pl-6",
                  onClick && "cursor-pointer hover:bg-muted/30",
                )}
                onClick={onClick}
                title={onClick ? "Datum pflegen" : undefined}
              >
                <span
                  className={cn(
                    "flex-1 truncate",
                    isPhase ? "font-medium" : "text-muted-foreground",
                  )}
                >
                  {!isPhase ? "↳ " : null}
                  {label}
                </span>
                <span className="w-20 text-right tabular-nums text-muted-foreground">
                  {ps ? formatDateShort(ps) : "—"}
                </span>
                <span className="w-20 text-right tabular-nums text-muted-foreground">
                  {pe ? formatDateShort(pe) : "—"}
                </span>
              </div>
            )
          })}
        </div>

        {/* Right scrollable Gantt-bar column */}
        <div
          ref={containerRef}
          className="flex-1 overflow-x-auto"
        >
      <svg
        ref={svgRef}
        width={totalWidth}
        height={totalHeight}
        className="block min-w-full select-none"
      >
        {/* PROJ-53 — Weekend bands span the canvas area below the header.
            Rendered first so bars + arrows + critical-path overlay sit on top. */}
        {weekendBands.map((band, i) => (
          <rect
            key={`weekend-${i}`}
            x={band.x}
            y={HEADER_HEIGHT}
            width={band.width}
            height={totalHeight - HEADER_HEIGHT}
            className="fill-muted"
            opacity={headerConfig.weekendOpacity}
            pointerEvents="none"
          />
        ))}

        {/* PROJ-53 — Grid lines: density per zoom (every day / every Monday /
            every 1st of month / every quarter-start). */}
        {gridLineXs.map((x, i) => (
          <line
            key={`grid-${i}`}
            x1={x}
            x2={x}
            y1={HEADER_HEIGHT}
            y2={totalHeight}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
            opacity={zoomLevel === "day" ? 0.18 : 0.3}
          />
        ))}

        {/* Today-Marker — vertikale rote Linie auf dem heutigen Datum,
            falls innerhalb des Calendar-Windows. Mirror OpenProject pattern. */}
        {(() => {
          const today = new Date()
          today.setUTCHours(0, 0, 0, 0)
          const days = daysBetween(calendarStart, today)
          if (days < 0 || days > totalDays) return null
          const x = days * pixelsPerDay
          return (
            <g aria-label="Heute">
              <line
                x1={x}
                x2={x}
                y1={0}
                y2={totalHeight}
                stroke="currentColor"
                className="text-destructive"
                strokeWidth={2}
                strokeDasharray="4 3"
                opacity={0.6}
              />
              {/* PROJ-53 fix L-1: place "heute" badge inside the top-row
                  (above the month label divider) so it no longer overlaps
                  the bottom-row day cells. */}
              <text
                x={x + 6}
                y={TOP_HEADER_HEIGHT - 6}
                fontSize={9}
                fontWeight={600}
                className="fill-destructive"
              >
                heute
              </text>
            </g>
          )
        })()}

        {/* PROJ-53 — Two-tier MS-Project-style header.
            Top row: month / quarter / year (major).
            Bottom row: day / week / month / quarter (minor). */}
        <rect
          x={0}
          y={0}
          width={totalWidth}
          height={TOP_HEADER_HEIGHT}
          className="fill-muted"
          opacity={0.65}
        />
        <rect
          x={0}
          y={TOP_HEADER_HEIGHT}
          width={totalWidth}
          height={BOTTOM_HEADER_HEIGHT}
          className="fill-muted"
          opacity={0.35}
        />
        <line
          x1={0}
          x2={totalWidth}
          y1={TOP_HEADER_HEIGHT}
          y2={TOP_HEADER_HEIGHT}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />
        <line
          x1={0}
          x2={totalWidth}
          y1={HEADER_HEIGHT}
          y2={HEADER_HEIGHT}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />

        {/* Top-row ticks (major) */}
        {topTicks.map((t, i) => (
          <g key={`top-${i}`}>
            <line
              x1={t.x}
              x2={t.x}
              y1={0}
              y2={TOP_HEADER_HEIGHT}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
            />
            <text
              x={t.x + 6}
              y={TOP_HEADER_HEIGHT / 2 + 4}
              className="fill-foreground"
              fontSize={11}
              fontWeight={600}
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Bottom-row ticks (minor) */}
        {bottomTicks.map((t, i) => {
          const fontSize = zoomLevel === "day" ? 10 : 11
          // For day-zoom, weekend cells get a slightly stronger fill so
          // Sa / So show up clearly even when the canvas weekend-band is
          // dimmed by overlapping bars.
          const weekendFill =
            zoomLevel === "day" && t.isWeekend
              ? "fill-muted opacity-50"
              : undefined
          // Center labels for narrow cells (day-zoom), left-aligned for wider ones.
          const labelX =
            headerConfig.bottomUnit === "day" ? t.x + t.width / 2 : t.x + 6
          const textAnchor =
            headerConfig.bottomUnit === "day" ? "middle" : "start"
          return (
            <g key={`bot-${i}`}>
              {weekendFill ? (
                <rect
                  x={t.x}
                  y={TOP_HEADER_HEIGHT}
                  width={t.width}
                  height={BOTTOM_HEADER_HEIGHT}
                  className={weekendFill}
                />
              ) : null}
              <line
                x1={t.x}
                x2={t.x}
                y1={TOP_HEADER_HEIGHT}
                y2={HEADER_HEIGHT}
                stroke="currentColor"
                className="text-border"
                strokeWidth={1}
                opacity={0.6}
              />
              <text
                x={labelX}
                y={TOP_HEADER_HEIGHT + BOTTOM_HEADER_HEIGHT / 2 + 4}
                textAnchor={textAnchor}
                className={cn(
                  "fill-foreground",
                  t.isWeekend && "fill-muted-foreground",
                )}
                fontSize={fontSize}
              >
                {t.label}
              </text>
              {t.tooltip ? <title>{t.tooltip}</title> : null}
            </g>
          )
        })}

        {/* Phase rows */}
        {phases.map((phase) => {
          const ps = toDate(phase.planned_start)
          const pe = toDate(phase.planned_end)
          const phaseRow = rows.find(
            (r) => r.kind === "phase" && r.phase.id === phase.id,
          )
          const idx = phaseRow?.rowIndex ?? 0
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
          const isDragging =
            drag?.kind === "phase" && drag.phaseId === phase.id
          const startDays = daysBetween(calendarStart, ps)
          const durationDays = daysBetween(ps, pe)
          let x = startDays * pixelsPerDay
          let width = durationDays * pixelsPerDay
          if (isDragging && drag.kind === "phase") {
            if (drag.mode === "move") {
              x += drag.deltaDays * pixelsPerDay
            } else {
              width = Math.max(
                pixelsPerDay,
                width + drag.deltaDays * pixelsPerDay,
              )
            }
          }

          const locked = phase.status === "completed"
          const draggable = canEdit && !locked
          const isLinkTarget =
            drag?.kind === "link" &&
            drag.targetType === "phase" &&
            drag.targetId === phase.id
          const isCritical =
            criticalPathOn && criticalPhaseIds.has(phase.id)

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

              {/* Bar — also the link-drop-zone (data-phase-target wired
                  to the elementFromPoint detection in onMove). */}
              <rect
                x={x}
                y={rowY + 4}
                width={width}
                height={ROW_HEIGHT - 8}
                rx={4}
                data-bar-target={`phase:${phase.id}`}
                className={cn(
                  barClasses(phase.status),
                  draggable ? "cursor-grab" : "cursor-default",
                  isDragging && "opacity-80 shadow-lg",
                  isLinkTarget &&
                    "stroke-foreground stroke-[3px]",
                  isCritical &&
                    "stroke-destructive stroke-[3px]",
                  submitting === phase.id && "animate-pulse",
                )}
                onMouseDown={(e) => startPhaseDrag(e, phase, "move")}
              />

              {/* Resize handle (right edge) — only if draggable */}
              {draggable ? (
                <rect
                  x={x + width - RESIZE_HANDLE_WIDTH}
                  y={rowY + 4}
                  width={RESIZE_HANDLE_WIDTH}
                  height={ROW_HEIGHT - 8}
                  className="fill-foreground/30 cursor-col-resize"
                  onMouseDown={(e) => startPhaseDrag(e, phase, "resize")}
                />
              ) : null}

              {/* Link-out hotspot — small circle at the right edge,
                  visible only when canEdit. Drag from here to another
                  bar to create an FS-dependency. */}
              {draggable ? (
                <circle
                  cx={x + width}
                  cy={rowY + ROW_HEIGHT / 2}
                  r={5}
                  className="fill-primary stroke-primary-foreground stroke-1 cursor-crosshair opacity-70 hover:opacity-100"
                  onMouseDown={(e) => startLinkDrag(e, "phase", phase.id)}
                >
                  <title>Dependency-Verknüpfung ziehen</title>
                </circle>
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

        {/* Work-package rows — Stage 5. Rendered after the parent phase
            in the row stream so they visually nest under their phase.
            Smaller bars + lighter color than phases. Drag/resize and
            link semantics mirror phases. */}
        {workPackages.map((wp) => {
          const wpRow = rows.find(
            (r) => r.kind === "work_package" && r.item.id === wp.id,
          )
          if (!wpRow) return null
          const idx = wpRow.rowIndex
          const rowY = HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)
          const ps = toDate(wp.planned_start ?? null)
          const pe = toDate(wp.planned_end ?? null)

          if (!ps || !pe) {
            const placeholderClickable =
              canEdit && onEditWorkItemRequest !== undefined
            return (
              <g
                key={`wp-${wp.id}`}
                aria-label={wp.title}
                className={placeholderClickable ? "cursor-pointer" : undefined}
                onClick={
                  placeholderClickable
                    ? () => onEditWorkItemRequest!(wp)
                    : undefined
                }
              >
                <rect
                  x={0}
                  y={rowY}
                  width={totalWidth}
                  height={ROW_HEIGHT}
                  className={cn(
                    "fill-muted/15",
                    placeholderClickable && "hover:fill-muted/30",
                  )}
                />
                <text
                  x={32}
                  y={rowY + ROW_HEIGHT / 2 + 4}
                  fontSize={11}
                  className={cn(
                    "italic",
                    placeholderClickable
                      ? "fill-primary"
                      : "fill-muted-foreground",
                  )}
                >
                  ↳ {wp.title} — {placeholderClickable
                    ? "Datum pflegen, um Bar + Dependencies zu aktivieren"
                    : "keine Daten gepflegt"}
                </text>
              </g>
            )
          }

          const isDragging =
            drag?.kind === "workpackage" && drag.workPackageId === wp.id
          const startDays = daysBetween(calendarStart, ps)
          const durationDays = daysBetween(ps, pe)
          let x = startDays * pixelsPerDay
          let width = Math.max(pixelsPerDay, durationDays * pixelsPerDay)
          if (isDragging && drag.kind === "workpackage") {
            if (drag.mode === "move") x += drag.deltaDays * pixelsPerDay
            else
              width = Math.max(
                pixelsPerDay,
                width + drag.deltaDays * pixelsPerDay,
              )
          }

          const isLinkTarget =
            drag?.kind === "link" &&
            drag.targetType === "work_package" &&
            drag.targetId === wp.id

          return (
            <g key={`wp-${wp.id}`} aria-label={`Arbeitspaket ${wp.title}`}>
              {idx % 2 === 1 ? (
                <rect
                  x={0}
                  y={rowY}
                  width={totalWidth}
                  height={ROW_HEIGHT}
                  className="fill-muted/15"
                />
              ) : null}

              {/* Indent visual: small chevron-bullet indicating "child of phase" */}
              <text
                x={12}
                y={rowY + ROW_HEIGHT / 2 + 4}
                fontSize={11}
                className="fill-muted-foreground pointer-events-none"
              >
                ↳
              </text>

              {/* WP bar — slimmer than phase bars, indigo accent. */}
              <rect
                x={x}
                y={rowY + 8}
                width={width}
                height={ROW_HEIGHT - 16}
                rx={3}
                data-bar-target={`work_package:${wp.id}`}
                className={cn(
                  "fill-indigo-400 stroke-indigo-700",
                  canEdit ? "cursor-grab" : "cursor-default",
                  isDragging && "opacity-80 shadow-md",
                  isLinkTarget && "stroke-foreground stroke-[3px]",
                  submitting === wp.id && "animate-pulse",
                )}
                onMouseDown={(e) => startWorkPackageDrag(e, wp, "move")}
              />

              {canEdit ? (
                <rect
                  x={x + width - RESIZE_HANDLE_WIDTH}
                  y={rowY + 8}
                  width={RESIZE_HANDLE_WIDTH}
                  height={ROW_HEIGHT - 16}
                  className="fill-foreground/30 cursor-col-resize"
                  onMouseDown={(e) => startWorkPackageDrag(e, wp, "resize")}
                />
              ) : null}

              {canEdit ? (
                <circle
                  cx={x + width}
                  cy={rowY + ROW_HEIGHT / 2}
                  r={5}
                  className="fill-primary stroke-primary-foreground stroke-1 cursor-crosshair opacity-70 hover:opacity-100"
                  onMouseDown={(e) =>
                    startLinkDrag(e, "work_package", wp.id)
                  }
                >
                  <title>Dependency-Verknüpfung ziehen</title>
                </circle>
              ) : null}

              <text
                x={x + 8}
                y={rowY + ROW_HEIGHT / 2 + 3}
                fontSize={11}
                className={cn(
                  "pointer-events-none",
                  width > 60 ? "fill-white" : "fill-foreground",
                )}
              >
                {wp.wbs_code ? `${wp.wbs_code} · ` : ""}
                {wp.title}
              </text>
            </g>
          )
        })}

        {/* Milestone diamonds — positioned at target_date within their
            phase row. Orphan milestones (no phase_id or phase not in
            view) are quietly skipped for Stage 2; a future slice can
            add a dedicated bottom row. */}
        {milestones.map((m) => {
          // For phase-container drag-with-children: when the parent phase
          // is being moved, milestones in that phase preview-shift by the
          // same delta on screen.
          const phaseShift =
            drag?.kind === "phase" &&
            drag.mode === "move" &&
            m.phase_id === drag.phaseId
              ? drag.deltaDays
              : 0

          // Layout: prefer the phase row; orphan milestones can drift
          // visually if the parent phase has no dates yet — render them
          // in the bottom area as a fallback.
          const layout = m.phase_id ? phaseLayout.get(m.phase_id) : undefined
          const td = toDate(m.target_date)
          if (!td) return null

          const cy = layout?.midY ?? totalHeight - ROW_HEIGHT / 2
          const draggable =
            canEdit && m.status !== "achieved" && m.status !== "cancelled"
          const isDraggingThis =
            drag?.kind === "milestone" && drag.milestoneId === m.id

          const baseX = daysBetween(calendarStart, td) * pixelsPerDay
          const x =
            baseX +
            (isDraggingThis ? drag.deltaDays * pixelsPerDay : 0) +
            phaseShift * pixelsPerDay

          const size = 8
          return (
            <g
              key={`ms-${m.id}`}
              aria-label={`Meilenstein ${m.name} – ${MILESTONE_STATUS_LABELS[m.status]}`}
            >
              <polygon
                points={`${x},${cy - size} ${x + size},${cy} ${x},${cy + size} ${x - size},${cy}`}
                className={cn(
                  milestoneFill(m.status),
                  draggable ? "cursor-grab" : "cursor-default",
                  isDraggingThis && "opacity-80",
                  submitting === m.id && "animate-pulse",
                )}
                strokeWidth={1.5}
                onMouseDown={(e) => startMilestoneDrag(e, m)}
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
          const from = barLayout.get(`${dep.from_type}:${dep.from_id}`)
          const to = barLayout.get(`${dep.to_type}:${dep.to_id}`)
          if (!from || !to) return null
          const x1 = from.x + from.width
          const y1 = from.midY
          const x2 = to.x
          const y2 = to.midY
          // Smooth bezier with horizontal control points scaled by gap.
          const dx = Math.max(20, Math.abs(x2 - x1) / 2)
          const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
          // Edge is critical when both endpoints are phases on the CP set.
          // (Work-packages don't participate in CP math in this MVP slice.)
          const isCriticalEdge =
            criticalPathOn &&
            dep.from_type === "phase" &&
            dep.to_type === "phase" &&
            criticalPhaseIds.has(dep.from_id) &&
            criticalPhaseIds.has(dep.to_id)
          const depLabel = `${dep.constraint_type} ${dep.from_type} → ${dep.to_type}`
          return (
            <g
              key={`dep-${dep.id}`}
              className={canEdit ? "cursor-pointer" : undefined}
              onClick={
                canEdit
                  ? (e) => {
                      e.stopPropagation()
                      void handleDeleteDependency(dep.id, depLabel)
                    }
                  : undefined
              }
            >
              {/* Wider transparent hit-area so the arrow is comfortably clickable. */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                pointerEvents={canEdit ? "stroke" : "none"}
              />
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={isCriticalEdge ? 2.5 : 1.5}
                className={
                  isCriticalEdge ? "text-destructive" : "text-foreground/60"
                }
                markerEnd="url(#gantt-arrow)"
                pointerEvents="none"
              />
              <title>
                Dependency {dep.constraint_type} · {dep.from_type} → {dep.to_type}
                {isCriticalEdge ? " · KRITISCH" : ""}
                {canEdit ? " · klicken zum Löschen" : ""}
              </title>
            </g>
          )
        })}

        {/* Ghost-arrow while a link drag is in progress. */}
        {drag?.kind === "link" &&
          (() => {
            const from = barLayout.get(`${drag.fromType}:${drag.fromId}`)
            if (!from) return null
            const x1 = from.x + from.width
            const y1 = from.midY
            const x2 = drag.mouseX
            const y2 = drag.mouseY
            const dx = Math.max(20, Math.abs(x2 - x1) / 2)
            const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
            return (
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="4 3"
                className={
                  drag.targetType ? "text-primary" : "text-foreground/40"
                }
                markerEnd="url(#gantt-arrow)"
                pointerEvents="none"
              />
            )
          })()}
      </svg>
        </div>
      </div>
    </div>
  )
}

function formatDateShort(iso: string): string {
  const slice = iso.slice(0, 10)
  const parts = slice.split("-")
  if (parts.length !== 3) return slice
  return `${parts[2]}.${parts[1]}.`
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
