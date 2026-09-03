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

import HolidaysLib from "date-holidays"
import { Lock } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  bottomTicks as buildBottomTicks,
  formatHolidayTooltip,
  gridLines as buildGridLines,
  headerConfigFor,
  type HolidayBand,
  type HolidayLookup,
  holidayBandsForRegion,
  topTicks as buildTopTicks,
  weekendBands as buildWeekendBands,
} from "@/lib/dates/gantt-timeline"
import { cn } from "@/lib/utils"
import {
  DependencyApiError,
  createDependency,
} from "@/lib/dependencies/api"
import {
  constraintBadge,
  type DependencyConstraintType,
} from "@/types/dependency"

import {
  DependencyEditDialog,
  type EditableDependency,
} from "./dependency-edit-dialog"
import { buildGanttRows, phaseRowKey } from "@/lib/work-items/gantt-rows"
// PROJ-155-β.2
import {
  CascadePreviewBar,
  type CascadePreviewSummary,
} from "@/components/phases/cascade-preview-bar"
import {
  cascadeEdgesFor,
  computeScheduleCascade,
  type CascadeNode,
  type CascadeResult,
} from "@/lib/work-items/schedule-cascade"
import { applyScheduleShift, ApplyScheduleError } from "@/lib/schedule/api"
import { type Milestone, MILESTONE_STATUS_LABELS } from "@/types/milestone"
import { PHASE_STATUS_LABELS, type Phase } from "@/types/phase"
import type { WorkItemWithProfile } from "@/types/work-item"
import { useAuth } from "@/hooks/use-auth"
// PROJ-53-β-ST-06 hook intentionally imported even though it currently
// returns the hard-coded `de-DE` literal — γ flips it to `tenants.locale`
// without touching this call site.
import { useTenantLocale } from "@/hooks/use-tenant-locale"

/**
 * PROJ-155-α — Endpunkt-Arten einer Abhängigkeit.
 *
 * `dependencies.from_type`/`to_type` erlauben in Prod
 * ('project','phase','work_package','todo','sprint') — gemessen am CHECK.
 * Die Oberfläche kannte bisher nur zwei davon, weshalb Tasks nicht
 * verknüpfbar waren, obwohl das Datenmodell es seit PROJ-9-R2 trägt.
 * `todo` ist die WBS-Ebene unter dem Arbeitspaket (ADR-004).
 */
type LinkType = "phase" | "work_package" | "todo"

const LINK_TYPES: ReadonlySet<string> = new Set<LinkType>([
  "phase",
  "work_package",
  "todo",
])

interface PolymorphicDependency {
  id: string
  from_type: LinkType
  from_id: string
  to_type: LinkType
  to_id: string
  constraint_type: DependencyConstraintType
  // PROJ-155-β.1 — der Gantt las den Abstand bisher gar nicht (0 Vorkommen im
  // ganzen Modul), obwohl die Spalte seit PROJ-9-Round-2 existiert. Ohne ihn
  // kann das Abzeichen ihn nicht zeigen und die Maske ihn nicht vorbelegen.
  lag_days: number
}

interface GanttViewProps {
  projectId: string
  phases: Phase[]
  milestones: Milestone[]
  /** PROJ-25 Stage 5 — work_items with kind='work_package' for the project. */
  /** Zeilen unterhalb der Phasen. PROJ-154: enthaelt Arbeitspakete UND jedes
   *  andere Work-Item mit Phasenzuordnung — der Name ist aus PROJ-25 geerbt
   *  und bewusst nicht umbenannt (1809 Zeilen Diff-Flaeche, Visual-Baselines).
   *  Was hier ankommt, entscheidet `lib/work-items/planning-items.ts`. */
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
  /**
   * PROJ-155-β.2 — rechnet ein Zug die Folgeverschiebungen der Nachfolger?
   *
   * Default **false**, und dann ist der ganze β.2-Pfad unerreichbar: das Ziehen
   * läuft durch denselben Code wie vor dieser Slice (AC-12). Bei `true` erzeugt
   * ein Zug eine **Vorschau** — auch dann wird nicht ungefragt geschrieben, der
   * Schalter entscheidet nur, ob gerechnet wird.
   */
  autoScheduleSuccessors?: boolean
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
      /**
       * PROJ-155-α — Zeitraum auf einer terminlosen Zeile aufziehen.
       *
       * Der Weg, den MS Project und OpenProject anbieten: statt 41 Dialoge
       * zu oeffnen (die Prod-Lage in AUE_0001: 0 von 41 Zeilen mit Termin)
       * zieht man den Balken direkt im Diagramm auf. Der Mensch legt den
       * Zeitraum fest — es wird nichts aus der Phase erfunden.
       */
      kind: "create"
      workItemId: string
      anchorDay: number
      currentDay: number
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
  autoScheduleSuccessors = false,
}: GanttViewProps) {
  const [drag, setDrag] = React.useState<DragState | null>(null)
  const [submitting, setSubmitting] = React.useState<string | null>(null)
  /**
   * PROJ-155-β.2 — die offene Kaskaden-Vorschau. `null` = keine.
   *
   * Solange sie steht, ist **nichts geschrieben** (AC-14). Sie hält den
   * gezogenen Knoten und das Ergebnis der Rechnung; die Geisterbalken lesen
   * daraus.
   */
  const [cascadePreview, setCascadePreview] = React.useState<{
    movedId: string
    movedStart: string
    movedEnd: string
    result: CascadeResult
  } | null>(null)
  const [applyingCascade, setApplyingCascade] = React.useState(false)
  const [dependencies, setDependencies] = React.useState<PolymorphicDependency[]>([])
  // PROJ-155-β.1 — die angeklickte Kante. Vorher fuehrte der Klick direkt in
  // die Loeschabfrage; jetzt oeffnet er die Bearbeitung, in der Loeschen eine
  // von drei Handlungen ist.
  const [editDependency, setEditDependency] =
    React.useState<EditableDependency | null>(null)
  const [zoomLevel, setZoomLevel] = React.useState<ZoomLevel>("week")
  const pixelsPerDay = ZOOM_PIXELS_PER_DAY[zoomLevel]
  const [criticalPhaseIds, setCriticalPhaseIds] = React.useState<Set<string>>(
    new Set(),
  )
  const [criticalPathOn, setCriticalPathOn] = React.useState(false)
  const [criticalPathLoading, setCriticalPathLoading] = React.useState(false)
  // PROJ-53-β — vertical scroll position drives the SVG-internal
  // sticky-header `<g transform={`translate(0, ${scrollTop})`}>` so the
  // two-tier header stays pinned to the visible top of the scroll
  // container without splitting the SVG into two render trees.
  const [scrollTop, setScrollTop] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  // PROJ-53-β — tenant region for holiday rendering. NULL = no holidays
  // (matches α behavior: weekends-only).
  const { currentTenant } = useAuth()
  const holidayRegion = currentTenant?.holiday_region ?? null
  // PROJ-53-β-ST-06 — locale hook; consumed by ./gantt-timeline.ts γ-day.
  // Read so the lint rule and the no-op contract stay live; γ wires it.
  useTenantLocale()

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
              LINK_TYPES.has(r.from_type ?? "") &&
              LINK_TYPES.has(r.to_type ?? ""),
          )
          .map(
            (r: {
              id: string
              from_type: LinkType
              from_id: string
              to_type: LinkType
              to_id: string
              constraint_type: PolymorphicDependency["constraint_type"]
              lag_days: number | null
            }) => ({
              id: r.id,
              lag_days: r.lag_days ?? 0,
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

  // PROJ-155-α — Zeilenliste kommt aus `buildGanttRows`: der WBS-Baum je
  // Phase, sortiert nach Termin, mit Tiefe und Terminquelle. Die frühere
  // Fassung war flach (Phase → Arbeitspakete) und sortierte gar nicht;
  // Tasks kamen darin überhaupt nicht vor.
  const [collapsedKeys, setCollapsedKeys] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const toggleCollapsed = React.useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const rows = React.useMemo(
    () => buildGanttRows({ phases, items: workPackages, collapsedKeys }),
    [phases, workPackages, collapsedKeys],
  )

  // Alle Zeilen, die ueberhaupt Kinder haben — Grundlage fuer "Alle
  // zuklappen". Aus der *aufgeklappten* Liste gerechnet, damit ein bereits
  // zugeklappter Teilbaum seine Nachkommen nicht verbirgt.
  const collapsibleKeys = React.useMemo(() => {
    const full = buildGanttRows({ phases, items: workPackages })
    return new Set(full.filter((r) => r.hasChildren).map((r) => r.key))
  }, [phases, workPackages])

  const [fullscreen, setFullscreen] = React.useState(false)
  React.useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullscreen])

  /**
   * PROJ-155-β.2 — die **wirksame** Vorschau.
   *
   * Geht der Schalter aus, während eine Vorschau offen steht, verschwindet sie:
   * sonst würde „Übernehmen" weiter schreiben, obwohl das Auto-Scheduling
   * gerade abgeschaltet wurde — der Schalter wäre in dem Moment eine
   * Behauptung. Beim Bauen selbst gefunden, nicht von einem Test.
   *
   * **Abgeleitet, nicht per Effekt zurückgesetzt.** Die erste Fassung war ein
   * `useEffect`, der `setCascadePreview(null)` rief; ESLint hat das mit
   * `react-hooks/set-state-in-effect` abgelehnt und die Regel hat recht — der
   * Wert ist aus zwei vorhandenen Zuständen berechenbar, und was berechenbar
   * ist, braucht keinen eigenen Zustand, der davon abdriften kann. Dieselbe
   * Lehre wie in β.1 und PROJ-70-β.
   */
  const activePreview = autoScheduleSuccessors ? cascadePreview : null

  /**
   * PROJ-155-β.2 / AC-14 — Escape verwirft die Vorschau, ohne zu schreiben.
   *
   * Eigener Effekt statt eine Bedingung in den Vollbild-Handler zu hängen: die
   * beiden haben nichts miteinander zu tun, und ein Escape im Vollbild soll
   * weiterhin das Vollbild schließen.
   */
  React.useEffect(() => {
    if (!activePreview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCascadePreview(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activePreview])

  /** Die Zusammenfassung für die Kopfzeile. */
  const cascadeSummary = React.useMemo<CascadePreviewSummary | null>(() => {
    if (!activePreview) return null
    const { shifts, skipped, conflicts, truncated } = activePreview.result
    // Der häufigste Verschiebungswert — oder `null`, wenn sie sich
    // unterscheiden. Eine gemittelte Zahl wäre eine erfundene Zahl.
    const deltas = new Set(shifts.map((x) => x.deltaDays))
    return {
      shiftCount: shifts.length,
      commonDeltaDays: deltas.size === 1 ? [...deltas][0] : null,
      skippedCount: skipped.length,
      conflictCount: conflicts.length,
      truncated,
    }
  }, [activePreview])

  /**
   * PROJ-155-β.2 — die Geisterbalken je Zeile.
   *
   * Enthält den gezogenen Knoten **und** jeden Nachfolger; `conflict` markiert
   * die, deren Bedingung nach der Kaskade verletzt bleibt (Interactions-Tabelle:
   * „wird in der Vorschau rot markiert und benannt").
   */
  const ghostByItemId = React.useMemo(() => {
    const m = new Map<string, { start: string; end: string; conflict: boolean }>()
    if (!activePreview) return m
    const imKonflikt = new Set(
      activePreview.result.conflicts.map((c) => c.edgeToId),
    )
    m.set(activePreview.movedId, {
      start: activePreview.movedStart,
      end: activePreview.movedEnd,
      conflict: imKonflikt.has(activePreview.movedId),
    })
    for (const sh of activePreview.result.shifts) {
      m.set(sh.id, {
        start: sh.start,
        end: sh.end,
        conflict: imKonflikt.has(sh.id),
      })
    }
    return m
  }, [activePreview])

  /**
   * PROJ-155-β.2 / AC-15 — Übernehmen schreibt in **einer** Anfrage.
   *
   * Die erwarteten Kennungen reisen mit, damit der Server melden kann, dass er
   * mit frischen Daten auf etwas anderes gekommen ist (Nutzer-Entscheid Q1:
   * bei Abweichung gewinnt der Server und die Oberfläche sagt es).
   */
  const applyCascade = React.useCallback(async () => {
    if (!activePreview) return
    setApplyingCascade(true)
    try {
      const res = await applyScheduleShift(projectId, {
        kind: "work_item",
        id: activePreview.movedId,
        start: activePreview.movedStart,
        end: activePreview.movedEnd,
        expectedShiftIds: activePreview.result.shifts.map((x) => x.id),
      })
      setCascadePreview(null)
      if (res.diverged_from_preview) {
        toast.warning("Übernommen — mit anderer Kaskade als in der Vorschau", {
          description:
            "Die Termine hatten sich zwischenzeitlich geändert. Es gilt die Rechnung des Servers.",
        })
      } else {
        toast.success(
          res.applied.total === 1
            ? "Termin übernommen"
            : `${res.applied.total} Termine übernommen`,
        )
      }
      onChanged()
    } catch (err) {
      toast.error("Übernehmen fehlgeschlagen", {
        description:
          err instanceof ApplyScheduleError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Unbekannter Fehler",
      })
      // Die Vorschau bleibt stehen: der Nutzer soll es erneut versuchen können,
      // ohne den Zug zu wiederholen.
    } finally {
      setApplyingCascade(false)
    }
  }, [activePreview, projectId, onChanged])

  // Zeilenposition je Key — der Ersatz für das frühere `row.rowIndex`.
  const rowIndexByKey = React.useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((row, idx) => m.set(row.key, idx))
    return m
  }, [rows])

  /**
   * Abhängigkeits-Typ eines Items. `dependencies.from_type` erlaubt seit
   * PROJ-9-R2 `work_package` und `todo`; die WBS-Ebene unter dem
   * Arbeitspaket ist `todo` (ADR-004). Damit bleiben bestehende
   * Arbeitspaket-Pfeile unberührt und Task-Verknüpfungen sind in β ohne
   * Schemaänderung anschließbar.
   */
  const depTypeOf = React.useCallback(
    (item: WorkItemWithProfile): "work_package" | "todo" =>
      item.kind === "work_package" ? "work_package" : "todo",
    [],
  )

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

  // PROJ-53-β — Holiday lookup keyed by ISO date.
  //
  // Empty Map when the tenant has no `holiday_region` set, or when the
  // zoom-level is month/quarter (we don't paint bands at those zooms
  // per β-ST-03). Library calls are memoized by (region, yearSpan) so a
  // bar drag does not retrigger the lookup.
  const yearsInWindow = React.useMemo(() => {
    const startYear = calendarStart.getUTCFullYear()
    const endYear = new Date(
      calendarStart.getTime() + totalDays * 86_400_000,
    ).getUTCFullYear()
    const years: number[] = []
    for (let y = startYear; y <= endYear; y++) years.push(y)
    return years
  }, [calendarStart, totalDays])

  const holidayLookup: HolidayLookup = React.useMemo(() => {
    if (!holidayRegion) return new Map<string, string>()
    // `date-holidays` accepts `DE`, `DE-NW`, `CH-ZH`, etc. — same
    // format the tenant settings UI emits.
    let instance: InstanceType<typeof HolidaysLib>
    try {
      const [country, state, region] = holidayRegion.split("-")
      if (region) {
        instance = new HolidaysLib(country, state, region)
      } else if (state) {
        instance = new HolidaysLib(country, state)
      } else {
        instance = new HolidaysLib(country)
      }
    } catch {
      return new Map<string, string>()
    }
    const map = new Map<string, string>()
    for (const year of yearsInWindow) {
      let list: ReturnType<typeof instance.getHolidays>
      try {
        list = instance.getHolidays(year)
      } catch {
        continue
      }
      for (const h of list ?? []) {
        if (h.type !== "public") continue
        const iso =
          typeof h.date === "string" ? h.date.slice(0, 10) : ""
        if (!iso) continue
        map.set(iso, h.name)
      }
    }
    return map
  }, [holidayRegion, yearsInWindow])

  const holidayBands: HolidayBand[] = React.useMemo(() => {
    // β-ST-03: only day + week zoom paint holiday bands; month/quarter
    // collapse them so the helper is skipped entirely.
    if (zoomLevel !== "day" && zoomLevel !== "week") return []
    return holidayBandsForRegion(
      calendarStart,
      totalDays,
      pixelsPerDay,
      holidayLookup,
    )
  }, [zoomLevel, calendarStart, totalDays, pixelsPerDay, holidayLookup])

  const holidayByIso: HolidayLookup = holidayLookup

  // PROJ-53-β — vertical scroll tracking. The container scrolls in
  // both axes; the sticky-header `<g>` translates by `scrollTop` so it
  // visually stays at the top of the visible viewport. rAF-throttled
  // so a fast scroll doesn't queue up React re-renders.
  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return
    let rafHandle: number | null = null
    const onScroll = () => {
      if (rafHandle != null) return
      rafHandle = window.requestAnimationFrame(() => {
        rafHandle = null
        setScrollTop(node.scrollTop)
      })
    }
    node.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      node.removeEventListener("scroll", onScroll)
      if (rafHandle != null) window.cancelAnimationFrame(rafHandle)
    }
  }, [])

  // Pre-compute the static layout of each bar (phase + work_package).
  // Keyed by `${type}:${id}` so arrows + critical-path + milestone code
  // can resolve any endpoint regardless of kind. A view-only `phaseLayout`
  // map is derived from it for the existing milestone positioning code.
  const barLayout = React.useMemo(() => {
    const m = new Map<
      string,
      { x: number; y: number; width: number; midY: number }
    >()
    rows.forEach((row, idx) => {
      const rowY = HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)
      let ps: Date | null = null
      let pe: Date | null = null
      let key: string
      if (row.kind === "phase") {
        ps = toDate(row.phase.planned_start)
        pe = toDate(row.phase.planned_end)
        key = `phase:${row.phase.id}`
      } else if (row.kind === "work_item") {
        // Effektive Termine: eigene oder aus den Kindern abgeleitete. Damit
        // hat auch ein Sammelvorgang einen Ankerpunkt für Pfeile.
        ps = toDate(row.start)
        pe = toDate(row.end)
        key = `${depTypeOf(row.item)}:${row.item.id}`
      } else {
        return // Eimer-Kopfzeile hat keinen Balken.
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
  }, [rows, calendarStart, pixelsPerDay, depTypeOf])

  // PROJ-155-β.1 — Kennung → lesbarer Name. Der Dialog nennt beide Enden der
  // Kante; ohne Namen stünde dort „work_package → work_package", was bei mehr
  // als einer Kante nichts unterscheidet.
  const entityLabel = React.useCallback(
    (type: string, id: string): string => {
      if (type === "phase") {
        return phases.find((p) => p.id === id)?.name ?? "Phase"
      }
      const item = workPackages.find((w) => w.id === id)
      if (item) return item.title
      return type === "project" ? "Projekt" : "Objekt"
    },
    [phases, workPackages],
  )

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

  /**
   * Aufziehen auf einer terminlosen Zeile. Der Klick darf den Bearbeiten-
   * Dialog nicht mitauslösen, daher `stopPropagation` — sonst öffnet sich
   * beim Loslassen zusätzlich das Formular.
   */
  const startCreateDrag = (
    e: React.MouseEvent<SVGRectElement>,
    workItemId: string,
  ) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const day = Math.floor((e.clientX - rect.left) / pixelsPerDay)
    setDrag({
      kind: "create",
      workItemId,
      anchorDay: day,
      currentDay: day,
    })
  }

  const createPreview = React.useMemo(() => {
    if (drag?.kind !== "create") return null
    const from = Math.min(drag.anchorDay, drag.currentDay)
    const to = Math.max(drag.anchorDay, drag.currentDay)
    const days = Math.max(1, to - from)
    return {
      id: drag.workItemId,
      x: from * pixelsPerDay,
      width: days * pixelsPerDay,
    }
  }, [drag, pixelsPerDay])

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
      if (drag.kind === "create") {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const day = Math.floor((e.clientX - rect.left) / pixelsPerDay)
        if (day === drag.currentDay) return
        setDrag((prev) =>
          prev && prev.kind === "create" ? { ...prev, currentDay: day } : prev,
        )
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
                LINK_TYPES.has(t) &&
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

      if (snapshot.kind === "create") {
        const from = Math.min(snapshot.anchorDay, snapshot.currentDay)
        const to = Math.max(snapshot.anchorDay, snapshot.currentDay)
        const newStart = addDays(calendarStart, from)
        // Mindestens ein Tag Dauer — ein reiner Klick soll nicht in einem
        // Null-Zeitraum enden, sondern in einem Tag.
        const newEnd = addDays(calendarStart, Math.max(to, from + 1))
        setSubmitting(snapshot.workItemId)
        try {
          const res = await fetch(
            `/api/projects/${projectId}/work-items/${snapshot.workItemId}`,
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
            throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
          }
          toast.success("Zeitraum gesetzt")
          onChanged()
        } catch (err) {
          toast.error("Zeitraum konnte nicht gesetzt werden", {
            description:
              err instanceof Error ? err.message : "Unbekannter Fehler",
          })
          onChanged()
        } finally {
          setSubmitting(null)
        }
        return
      }

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
          /**
           * PROJ-155-β.2 / AC-20 — **eine** Anfrage, eine Transaktion.
           *
           * Vorher: die Phase per eigenem PATCH, danach N Meilenstein-PATCHes
           * über `Promise.all`, jeder mit `.catch(() => undefined)`. Scheiterten
           * alle N, war die Phase trotzdem schon verschoben — zwei
           * Schreibphasen, keine Transaktion, Fehler verschluckt. Der Server
           * fächert die Kind-Meilensteine jetzt selbst auf und schreibt sie mit
           * der Phase gemeinsam; schlägt ein Meilenstein fehl, bewegt sich auch
           * die Phase nicht.
           *
           * Das gilt **unabhängig** vom Auto-Scheduling-Schalter: der
           * verschluckte Fehler war ein Bestandsdefekt, kein Merkmal der neuen
           * Fähigkeit. Für AC-12 bleibt das Verhalten bei „aus" gleich — Phase
           * und Meilensteine wandern wie bisher —, nur der Fehlerfall ist jetzt
           * ehrlich statt halb geschrieben.
           */
          await applyScheduleShift(projectId, {
            kind: "phase",
            id: snapshot.phaseId,
            start: toIsoDate(newStart),
            end: toIsoDate(newEnd),
          })
          toast.success("Phase aktualisiert")
          onChanged()
        } catch (err) {
          toast.error("Aktualisierung fehlgeschlagen", {
            description:
              err instanceof ApplyScheduleError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : "Unbekannter Fehler",
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
        /**
         * PROJ-155-β.2 — bei eingeschaltetem Auto-Scheduling wird **gerechnet
         * und gezeigt**, nicht geschrieben.
         *
         * Der `return` hier ist die ganze Trennung zu AC-12: ist der Schalter
         * aus, läuft der Code darunter unverändert weiter — derselbe einzelne
         * PATCH wie vor dieser Slice.
         */
        if (autoScheduleSuccessors) {
          const nodes: CascadeNode[] = workPackages.map((w) => ({
            id: w.id,
            // `?? null` statt den Lib-Typ aufzuweichen: `WorkItemWithProfile`
            // fuehrt die Termine als `string | null | undefined`, die Rechnung
            // kennt nur `string | null`. Der Aufrufer normalisiert.
            window: { start: w.planned_start ?? null, end: w.planned_end ?? null },
          }))
          // PROJ-Y-155f — dieselbe Funktion, die auch die Route benutzt. Die
          // Regel (nur Kanten zwischen bekannten Knoten; `dependencies` ist
          // polymorph und traegt auch Phasen-Kanten) lebt jetzt an EINER Stelle.
          const edges = cascadeEdgesFor(nodes, dependencies)
          const result = computeScheduleCascade(
            snapshot.workPackageId,
            { start: toIsoDate(newStart), end: toIsoDate(newEnd) },
            nodes,
            edges,
          )
          setCascadePreview({
            movedId: snapshot.workPackageId,
            movedStart: toIsoDate(newStart),
            movedEnd: toIsoDate(newEnd),
            result,
          })
          return
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
          // PROJ-155-β.1 — über den geteilten Wrapper statt über rohes `fetch`.
          //
          // Der frühere Zweig las `err?.message`, die API antwortet aber
          // `{ error: { code, message } }` — die Begründung war also **immer**
          // `undefined`. Wer im Diagramm einen Kreis zog, bekam
          // „Dependency-Erstellung fehlgeschlagen" ohne jeden Grund, obwohl
          // die Route seit jeher `cycle_detected` liefert. Der Wrapper wertet
          // den stabilen `code` aus und übersetzt ihn.
          //
          // `FS`/0 bleibt hier die Vorgabe: Ziehen ist die schnelle Geste, der
          // Typ wird danach in der Maske gesetzt (ein Zug kann ihn nicht
          // ausdrücken).
          await createDependency(projectId, {
            from_type: snapshot.fromType,
            from_id: snapshot.fromId,
            to_type: snapshot.targetType,
            to_id: snapshot.targetId,
            constraint_type: "FS",
            lag_days: 0,
          })
          toast.success("Abhängigkeit erstellt")
          onChanged()
        } catch (err) {
          toast.error("Abhängigkeit konnte nicht erstellt werden", {
            description:
              err instanceof DependencyApiError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : "Unbekannter Fehler",
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
    // `calendarStart` ist Pflicht: der create-Zweig rechnet den aufgezogenen
    // Tagesindex gegen dieses Fenster in ein Datum um. Fehlt es hier, schreibt
    // der Handler nach einer Fensterverschiebung falsche Termine.
    //
    // PROJ-155-β.2 ergänzt `autoScheduleSuccessors`, `dependencies` und
    // `workPackages`. ESLint hat sie eingefordert, und die Regel hat recht:
    // ohne sie rechnet die Kaskade mit dem Kanten- und Terminstand von der
    // Registrierung des Handlers. Legt der Nutzer eine Kante an und zieht
    // danach, würde sie ignoriert — dieselbe Klasse wie der `calendarStart`-Fund
    // aus β.1, wo ein fehlender Eintrag nach einer Fensterverschiebung falsche
    // Termine geschrieben hätte.
  }, [
    drag,
    projectId,
    milestones,
    onChanged,
    pixelsPerDay,
    calendarStart,
    autoScheduleSuccessors,
    dependencies,
    workPackages,
  ])

  // PROJ-155-β.1 — der frühere `handleDeleteDependency` ist entfallen.
  // Er war der einzige Weg an einer Kante und fragte per `window.confirm`;
  // jetzt öffnet der Klick `DependencyEditDialog`, in dem Entfernen eine von
  // drei Handlungen ist. Der Schreibweg liegt in `lib/dependencies/api`.

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
      {/* PROJ-155-β.2 — die Vorschau steht ueber dem Diagramm, damit die Zahl
          und die zwei Knoepfe sichtbar sind, ohne zu scrollen. */}
      {cascadeSummary ? (
        <CascadePreviewBar
          summary={cascadeSummary}
          busy={applyingCascade}
          onApply={applyCascade}
          onDiscard={() => setCascadePreview(null)}
        />
      ) : null}
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

        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          aria-pressed={fullscreen}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          {fullscreen ? "Vollbild verlassen" : "Vollbild"}
        </button>

        <button
          type="button"
          onClick={() => setCollapsedKeys(collapsibleKeys)}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          Alle zuklappen
        </button>
        <button
          type="button"
          onClick={() => setCollapsedKeys(new Set<string>())}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          Alle aufklappen
        </button>
      </div>
      <div
        className={cn(
          "flex rounded-md border bg-card",
          // PROJ-155-α: im Vollbild fuellt das Diagramm das Fenster. Vorher
          // war die Hoehe hart auf 70vh gedeckelt — bei 42 Zeilen (Prod-Lage
          // in AUE_0001) sah man rund ein Viertel davon.
          fullscreen && "fixed inset-0 z-50 rounded-none",
        )}
        role="region"
        aria-label="Gantt-Diagramm der Phasen"
      >
        {/* Left fixed table column — name + dates per row.
            OpenProject-style split: items stay visible even without bars. */}
        <div
          className={cn(
            "shrink-0 border-r",
            fullscreen ? "w-96" : "w-72",
          )}
        >
          <div
            style={{ height: HEADER_HEIGHT }}
            className="flex items-center gap-2 border-b bg-muted/50 px-3 text-xs font-medium text-muted-foreground"
          >
            <span className="flex-1">Name</span>
            <span className="w-20 text-right">Start</span>
            <span className="w-20 text-right">Ende</span>
          </div>
          {rows.map((row, idx) => {
            const label =
              row.kind === "phase"
                ? `${row.phase.sequence_number}. ${row.phase.name}`
                : row.kind === "bucket"
                  ? row.label
                  : row.item.title
            // Der Termin steht in der Tabelle so, wie er am Balken gilt:
            // eigener oder abgeleiteter. Die Herkunft macht das Abzeichen
            // sichtbar — sonst liest sich ein Sammelvorgang wie ein
            // eingetragener Termin.
            const isDerived = row.dateSource === "derived"
            const onClick =
              row.kind === "work_item" && onEditWorkItemRequest
                ? () => onEditWorkItemRequest!(row.item)
                : undefined
            return (
              <div
                key={row.key}
                style={{ height: ROW_HEIGHT + ROW_GAP }}
                className={cn(
                  "flex items-center gap-1 border-b border-border/40 px-3 text-xs",
                  idx % 2 === 1 && "bg-muted/15",
                  row.kind === "bucket" && "bg-muted/30",
                  onClick && "cursor-pointer hover:bg-muted/30",
                )}
                onClick={onClick}
                title={onClick ? "Zum Bearbeiten öffnen" : undefined}
              >
                {/* Einrückung nach WBS-Tiefe, wie in MS Project und
                    OpenProject. Tiefe 1 sitzt direkt unter der Phase. */}
                <span
                  aria-hidden
                  style={{ width: Math.max(0, row.depth - 1) * 14 }}
                  className="shrink-0"
                />
                {row.hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleCollapsed(row.key)
                    }}
                    aria-expanded={!row.collapsed}
                    aria-label={
                      row.collapsed
                        ? `${label} aufklappen`
                        : `${label} zuklappen`
                    }
                    className="shrink-0 rounded px-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {row.collapsed ? "▸" : "▾"}
                  </button>
                ) : (
                  <span aria-hidden className="w-3.5 shrink-0" />
                )}
                <span
                  className={cn(
                    "flex-1 truncate",
                    row.kind === "phase"
                      ? "font-medium"
                      : row.kind === "bucket"
                        ? "font-medium text-muted-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {isDerived ? (
                  <span
                    className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                    title="Zeitraum aus den Unterpunkten abgeleitet"
                  >
                    abgeleitet
                  </span>
                ) : null}
                <span className="w-20 text-right tabular-nums text-muted-foreground">
                  {row.start ? formatDateShort(row.start) : "—"}
                </span>
                <span className="w-20 text-right tabular-nums text-muted-foreground">
                  {row.end ? formatDateShort(row.end) : "—"}
                </span>
              </div>
            )
          })}
        </div>

        {/* Right scrollable Gantt-bar column.
            PROJ-53-β: dual-axis scroll. Vertical scroll drives the
            scrollTop state that powers the SVG-internal sticky-header.
            max-h is a viewport-relative cap so the page itself doesn't
            stretch to the full row count of giant projects. */}
        <div
          ref={containerRef}
          className={cn(
            "flex-1 overflow-auto",
            // Ausserhalb des Vollbilds bleibt ein Deckel, damit die Seite bei
            // grossen Projekten nicht endlos waechst — aber deutlich hoeher
            // als die frueheren 70vh. Im Vollbild entfaellt er ganz.
            fullscreen ? "h-screen" : "max-h-[calc(100vh-16rem)]",
          )}
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

        {/* PROJ-53-β — Holiday bands (β-ST-03).
            Painted in day + week zoom only; month + quarter return
            empty `holidayBands` array (β-ST-03 AC). Color is amber/40
            so it stays distinct from the muted weekend color (β-D4).
            Stacked above weekend bands so a Feiertag-on-Saturday wins
            the visual contest. `<title>` provides the hover tooltip;
            `aria-label` on the wrapping `<g>` is the SR-readable form. */}
        {holidayBands.map((band) => (
          <g
            key={`hol-${band.isoDate}`}
            aria-label={`Feiertag ${formatHolidayTooltip(band.isoDate, band.name)}`}
          >
            <rect
              x={band.x}
              y={HEADER_HEIGHT}
              width={band.width}
              height={totalHeight - HEADER_HEIGHT}
              className="fill-amber-300"
              opacity={0.32}
              pointerEvents="none"
            />
            <title>{formatHolidayTooltip(band.isoDate, band.name)}</title>
          </g>
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
            falls innerhalb des Calendar-Windows. The "heute" badge label
            lives in the sticky-header `<g>` at the end of the SVG so it
            stays in viewport even when the user scrolls the canvas. */}
        {(() => {
          const today = new Date()
          today.setUTCHours(0, 0, 0, 0)
          const days = daysBetween(calendarStart, today)
          if (days < 0 || days > totalDays) return null
          const x = days * pixelsPerDay
          return (
            <line
              aria-label="Heute"
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
          )
        })()}

        {/* PROJ-53-β — Two-tier header is rendered LAST in the SVG so it
            stacks above bars/deps/today-line, then wrapped in a `<g>`
            that translates by `scrollTop` for sticky-header behavior.
            The block lives at the end of the SVG; see the comment near
            "Sticky-Header (PROJ-53-β)". */}

        {/* Phase rows */}
        {phases.map((phase) => {
          const ps = toDate(phase.planned_start)
          const pe = toDate(phase.planned_end)
          const idx = rowIndexByKey.get(phaseRowKey(phase.id)) ?? 0
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
        {rows.map((row, idx) => {
          if (row.kind !== "work_item") return null
          const wp = row.item
          const depType = depTypeOf(wp)
          // PROJ-155-α: Sammelvorgang — die Termine stammen aus den Kindern,
          // nicht aus dem Item selbst. Er wird als Klammer dargestellt und ist
          // NICHT ziehbar: sein Zeitraum ist ein Ergebnis, kein Eingabefeld
          // (MS-Project- und OpenProject-Semantik).
          const isSummary = row.dateSource === "derived"
          const barDraggable = canEdit && !isSummary
          const indent = Math.max(0, row.depth - 1) * 14
          const rowY = HEADER_HEIGHT + idx * (ROW_HEIGHT + ROW_GAP)
          const ps = toDate(row.start)
          const pe = toDate(row.end)

          if (!ps || !pe) {
            const placeholderClickable =
              canEdit && onEditWorkItemRequest !== undefined
            return (
              <g key={`wp-${wp.id}`} aria-label={wp.title}>
                <rect
                  x={0}
                  y={rowY}
                  width={totalWidth}
                  height={ROW_HEIGHT}
                  className={cn(
                    "fill-muted/15",
                    canEdit
                      ? "cursor-crosshair hover:fill-muted/30"
                      : placeholderClickable && "hover:fill-muted/30",
                  )}
                  onMouseDown={
                    canEdit
                      ? (e) => startCreateDrag(e, wp.id)
                      : undefined
                  }
                />
                {/* Vorschau des aufgezogenen Zeitraums. */}
                {createPreview && createPreview.id === wp.id ? (
                  <rect
                    x={createPreview.x}
                    y={rowY + 8}
                    width={createPreview.width}
                    height={ROW_HEIGHT - 16}
                    rx={3}
                    className="fill-primary/40 stroke-primary pointer-events-none"
                  />
                ) : null}
                {/* Der Titel oeffnet das Formular, die Flaeche zieht den
                    Zeitraum auf. Getrennt, weil ein onClick auf der ganzen
                    Zeile nach jedem Aufziehen zusaetzlich den Dialog oeffnen
                    wuerde. */}
                <text
                  x={32 + indent}
                  y={rowY + ROW_HEIGHT / 2 + 4}
                  fontSize={11}
                  className={cn(
                    "italic",
                    placeholderClickable
                      ? "fill-primary cursor-pointer"
                      : "fill-muted-foreground",
                  )}
                  onClick={
                    placeholderClickable
                      ? () => onEditWorkItemRequest!(wp)
                      : undefined
                  }
                >
                  ↳ {wp.title} — {canEdit
                    ? "Zeitraum im Diagramm aufziehen"
                    : "kein Termin — auch nicht aus Unterpunkten ableitbar"}
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
            drag.targetType === depType &&
            drag.targetId === wp.id

          // PROJ-155-β.2 — die vorgeschlagene Lage dieser Zeile, falls eine
          // Vorschau offen ist. `null` = diese Zeile ist nicht betroffen.
          const ghost = ghostByItemId.get(wp.id) ?? null
          const ghostGeo = ghost
            ? (() => {
                const gs = toDate(ghost.start)
                const ge = toDate(ghost.end)
                if (!gs || !ge) return null
                const gx = daysBetween(calendarStart, gs) * pixelsPerDay
                const gw = Math.max(
                  pixelsPerDay,
                  daysBetween(gs, ge) * pixelsPerDay,
                )
                return { gx, gw }
              })()
            : null

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

              {/* PROJ-155-β.2 — Geisterbalken: die vorgeschlagene Lage, noch
                  nicht geschrieben. Gestrichelt und ohne Füllung, damit er nicht
                  mit dem Ist-Balken verwechselt wird; rot, wenn danach eine
                  Bedingung verletzt bleibt. */}
              {ghostGeo ? (
                <rect
                  x={ghostGeo.gx}
                  y={rowY + 4}
                  width={ghostGeo.gw}
                  height={ROW_HEIGHT - 8}
                  rx={3}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  className={
                    ghost?.conflict
                      ? "fill-destructive/10 stroke-destructive"
                      : "fill-warning/10 stroke-warning"
                  }
                  aria-label={`Vorgeschlagen: ${ghost?.start} bis ${ghost?.end}`}
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

              {/* Sammelvorgang: schmale Klammer wie in MS Project. Sein
                  Zeitraum ist die Spanne der Kinder, also ein Ergebnis —
                  darum kein Ziehen und kein Resize-Griff. */}
              {isSummary ? (
                <g data-bar-target={`${depType}:${wp.id}`}>
                  <rect
                    x={x}
                    y={rowY + ROW_HEIGHT / 2 - 3}
                    width={width}
                    height={6}
                    className={cn(
                      "fill-foreground/70",
                      isLinkTarget && "stroke-foreground stroke-[3px]",
                    )}
                  >
                    <title>
                      Abgeleitet aus den Unterpunkten — nicht direkt verschiebbar
                    </title>
                  </rect>
                  {/* Die zwei Klammerfüße, die den Sammelvorgang lesbar machen. */}
                  <path
                    d={`M ${x} ${rowY + ROW_HEIGHT / 2 + 3} l 0 6 l 5 -6 z`}
                    className="fill-foreground/70"
                  />
                  <path
                    d={`M ${x + width} ${rowY + ROW_HEIGHT / 2 + 3} l 0 6 l -5 -6 z`}
                    className="fill-foreground/70"
                  />
                </g>
              ) : (
                <rect
                  x={x}
                  y={rowY + 8}
                  width={width}
                  height={ROW_HEIGHT - 16}
                  rx={3}
                  data-bar-target={`${depType}:${wp.id}`}
                  className={cn(
                    "fill-indigo-400 stroke-indigo-700",
                    barDraggable ? "cursor-grab" : "cursor-default",
                    isDragging && "opacity-80 shadow-md",
                    isLinkTarget && "stroke-foreground stroke-[3px]",
                    submitting === wp.id && "animate-pulse",
                  )}
                  onMouseDown={
                    barDraggable
                      ? (e) => startWorkPackageDrag(e, wp, "move")
                      : undefined
                  }
                />
              )}

              {barDraggable ? (
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
                  onMouseDown={(e) => startLinkDrag(e, depType, wp.id)}
                >
                  <title>Abhängigkeit ziehen</title>
                </circle>
              ) : null}

              <text
                x={isSummary ? x + width + 8 : x + 8}
                y={rowY + ROW_HEIGHT / 2 + 3}
                fontSize={11}
                className={cn(
                  "pointer-events-none",
                  isSummary
                    ? "fill-muted-foreground"
                    : width > 60
                      ? "fill-white"
                      : "fill-foreground",
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
          // PROJ-155-β.1 — Namen statt Typen: „Fundament gießen → Rohbau",
          // nicht „work_package → work_package". Der Dialog zeigt sie, und
          // ohne sie wäre nicht erkennbar, welche Kante man geöffnet hat.
          const openEdit = () =>
            setEditDependency({
              id: dep.id,
              constraint_type: dep.constraint_type,
              lag_days: dep.lag_days ?? 0,
              fromLabel: entityLabel(dep.from_type, dep.from_id),
              toLabel: entityLabel(dep.to_type, dep.to_id),
            })
          // Abzeichen nur bei Abweichung vom Normalfall. `FS` ohne Abstand
          // bleibt unbeschriftet — sonst wäre jedes Diagramm zugepflastert
          // und die Kennzeichnung sagte nichts mehr aus.
          const badge = constraintBadge(dep.constraint_type, dep.lag_days)
          const badgeX = (x1 + x2) / 2
          const badgeY = (y1 + y2) / 2 - 4
          return (
            <g
              key={`dep-${dep.id}`}
              className={canEdit ? "cursor-pointer" : undefined}
              // Tastatur: der Pfeil war bisher ausschliesslich mit der Maus
              // erreichbar. `role`/`tabIndex` machen ihn anfahrbar, Enter und
              // Leertaste öffnen dieselbe Maske wie der Klick.
              role="button"
              tabIndex={0}
              aria-label={`Abhängigkeit ${dep.constraint_type} von ${entityLabel(
                dep.from_type,
                dep.from_id,
              )} nach ${entityLabel(dep.to_type, dep.to_id)}${
                badge ? ` (${badge})` : ""
              } — öffnen`}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return
                e.preventDefault()
                e.stopPropagation()
                openEdit()
              }}
              onClick={(e) => {
                e.stopPropagation()
                openEdit()
              }}
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
              {badge ? (
                <>
                  <rect
                    x={badgeX - 16}
                    y={badgeY - 9}
                    width={32}
                    height={14}
                    rx={3}
                    className="fill-background stroke-border"
                    pointerEvents="none"
                  />
                  <text
                    x={badgeX}
                    y={badgeY + 1}
                    textAnchor="middle"
                    fontSize={9}
                    className="fill-muted-foreground"
                    pointerEvents="none"
                  >
                    {badge}
                  </text>
                </>
              ) : null}
              <title>
                Dependency {dep.constraint_type} · {dep.from_type} → {dep.to_type}
                {isCriticalEdge ? " · KRITISCH" : ""}
                {canEdit ? " · klicken zum Bearbeiten" : " · klicken zum Ansehen"}
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

        {/* Sticky-Header (PROJ-53-β).
            Rendered last so it stacks on top of bars, today-line,
            deps and drag preview. Translated by `scrollTop` so it
            stays pinned to the visible top of the scroll container
            without splitting the SVG into two render trees.
            An opaque `fill-card` rect underneath masks anything that
            would otherwise show through the semi-transparent muted
            backgrounds when the user has scrolled. */}
        <g transform={`translate(0, ${scrollTop})`}>
          {/* Opaque mask so the scrolled-under canvas content doesn't
              bleed through the semi-transparent muted header rects. */}
          <rect
            x={0}
            y={0}
            width={totalWidth}
            height={HEADER_HEIGHT}
            className="fill-card"
          />
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

          {/* Bottom-row ticks (minor).
              Day-zoom: per-cell weekend fill + per-cell holiday fill
              (β-D4 — holiday wins over weekend per β-ST-03 AC). */}
          {bottomTicks.map((t, i) => {
            const fontSize = zoomLevel === "day" ? 10 : 11
            const weekendFill =
              zoomLevel === "day" && t.isWeekend
                ? "fill-muted opacity-50"
                : undefined
            // Build the iso-date for the cell to look up a holiday.
            // Only day-zoom has 1-day cells; other zooms collapse holidays.
            let holidayName: string | undefined
            if (zoomLevel === "day") {
              const dayOffset = Math.round(t.x / pixelsPerDay)
              const cellDate = new Date(
                calendarStart.getTime() + dayOffset * 86_400_000,
              )
              const iso =
                `${cellDate.getUTCFullYear()}-${String(cellDate.getUTCMonth() + 1).padStart(2, "0")}-${String(cellDate.getUTCDate()).padStart(2, "0")}`
              holidayName = holidayByIso.get(iso)
            }
            const labelX =
              headerConfig.bottomUnit === "day" ? t.x + t.width / 2 : t.x + 6
            const textAnchor =
              headerConfig.bottomUnit === "day" ? "middle" : "start"
            return (
              <g key={`bot-${i}`}>
                {holidayName ? (
                  <rect
                    x={t.x}
                    y={TOP_HEADER_HEIGHT}
                    width={t.width}
                    height={BOTTOM_HEADER_HEIGHT}
                    className="fill-amber-300"
                    opacity={0.55}
                  />
                ) : weekendFill ? (
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
                    t.isWeekend && !holidayName && "fill-muted-foreground",
                    holidayName && "fill-amber-900 font-semibold",
                  )}
                  fontSize={fontSize}
                >
                  {t.label}
                </text>
                {holidayName ? (
                  <title>
                    {(() => {
                      const dayOffset = Math.round(t.x / pixelsPerDay)
                      const cellDate = new Date(
                        calendarStart.getTime() + dayOffset * 86_400_000,
                      )
                      const iso =
                        `${cellDate.getUTCFullYear()}-${String(cellDate.getUTCMonth() + 1).padStart(2, "0")}-${String(cellDate.getUTCDate()).padStart(2, "0")}`
                      return formatHolidayTooltip(iso, holidayName!)
                    })()}
                  </title>
                ) : t.tooltip ? (
                  <title>{t.tooltip}</title>
                ) : null}
              </g>
            )
          })}

          {/* "heute"-Badge — sticky companion to the today line in the
              canvas. PROJ-53 fix L-1: placed inside the top-row above
              the divider so it never overlaps a bottom-row day label. */}
          {(() => {
            const today = new Date()
            today.setUTCHours(0, 0, 0, 0)
            const days = daysBetween(calendarStart, today)
            if (days < 0 || days > totalDays) return null
            const x = days * pixelsPerDay
            return (
              <text
                x={x + 6}
                y={TOP_HEADER_HEIGHT - 6}
                fontSize={9}
                fontWeight={600}
                className="fill-destructive"
              >
                heute
              </text>
            )
          })()}
        </g>
      </svg>
        </div>
      </div>

      <DependencyEditDialog
        projectId={projectId}
        dependency={editDependency}
        canEdit={canEdit}
        onOpenChange={(open) => {
          if (!open) setEditDependency(null)
        }}
        onChanged={onChanged}
      />
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
    case "suspended":
      // PROJ-139 — paused: amber, distinct from cancelled.
      return "fill-amber-500/60 stroke-amber-600"
    case "planned":
    default:
      return "fill-blue-500/70 stroke-blue-700"
  }
}
