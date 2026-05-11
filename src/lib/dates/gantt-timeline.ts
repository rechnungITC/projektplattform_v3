/**
 * Gantt timeline-scale helpers (PROJ-53-α).
 *
 * Pure date-math + ISO-8601 calendar-week + zoom-specific header tier
 * configuration. Used by `src/components/phases/gantt-view.tsx` to render
 * the MS-Project-style two-tier header with weekend bands and day/week/
 * month/quarter grids.
 *
 * No browser dependencies beyond `Intl.DateTimeFormat`. All date input is
 * treated as UTC midnight to stay consistent with how `gantt-view.tsx`
 * computes its calendar window.
 */

export type ZoomLevel = "day" | "week" | "month" | "quarter"

export type TopUnit = "year" | "quarter" | "month"
export type BottomUnit = "quarter" | "month" | "week" | "day"

export interface HeaderConfig {
  topUnit: TopUnit
  bottomUnit: BottomUnit
  showWeekends: boolean
  showDayGrid: boolean
  weekendOpacity: number
}

const HEADER_CONFIG: Record<ZoomLevel, HeaderConfig> = {
  day: {
    topUnit: "month",
    bottomUnit: "day",
    showWeekends: true,
    showDayGrid: true,
    weekendOpacity: 0.5,
  },
  week: {
    topUnit: "month",
    bottomUnit: "week",
    showWeekends: true,
    showDayGrid: false,
    weekendOpacity: 0.3,
  },
  month: {
    topUnit: "quarter",
    bottomUnit: "month",
    showWeekends: false,
    showDayGrid: false,
    weekendOpacity: 0,
  },
  quarter: {
    topUnit: "year",
    bottomUnit: "quarter",
    showWeekends: false,
    showDayGrid: false,
    weekendOpacity: 0,
  },
}

export function headerConfigFor(zoom: ZoomLevel): HeaderConfig {
  return HEADER_CONFIG[zoom]
}

function addDaysUTC(d: Date, n: number): Date {
  const out = new Date(d.getTime())
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

/**
 * ISO 8601 calendar-week. Monday = day 1; week 1 is the week containing
 * the first Thursday of the year. Returns the ISO year (which can differ
 * from the input calendar year at year boundaries — e.g. 2024-12-30 is in
 * KW 1 / 2025).
 */
export function isoWeekNumber(d: Date): { year: number; week: number } {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  )
  return { year: t.getUTCFullYear(), week }
}

export function quarterOf(d: Date): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const q = (Math.floor(d.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4
  return { year: d.getUTCFullYear(), quarter: q }
}

export function weekendBands(
  start: Date,
  totalDays: number,
  pixelsPerDay: number,
): { x: number; width: number }[] {
  const out: { x: number; width: number }[] = []
  for (let d = 0; d < totalDays; d++) {
    const date = addDaysUTC(start, d)
    const dow = date.getUTCDay()
    if (dow === 6) {
      const w = Math.min(2, totalDays - d)
      out.push({ x: d * pixelsPerDay, width: w * pixelsPerDay })
      d += w - 1
    } else if (dow === 0) {
      out.push({ x: d * pixelsPerDay, width: pixelsPerDay })
    }
  }
  return out
}

export interface Tick {
  x: number
  width: number
  label: string
  tooltip?: string
  isWeekend?: boolean
}

const MONTH_LONG = new Intl.DateTimeFormat("de-DE", { month: "long" })
const MONTH_SHORT = new Intl.DateTimeFormat("de-DE", { month: "short" })
const WEEKDAY_SHORT = new Intl.DateTimeFormat("de-DE", { weekday: "short" })
const FULL_DATE = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
})

function clampedCellWidth(
  start: Date,
  totalDays: number,
  cellStart: Date,
  cellEnd: Date,
  pixelsPerDay: number,
): { x: number; width: number } {
  const end = addDaysUTC(start, totalDays)
  const cs = cellStart < start ? start : cellStart
  const ce = cellEnd > end ? end : cellEnd
  return {
    x: daysBetween(start, cs) * pixelsPerDay,
    width: Math.max(0, daysBetween(cs, ce) * pixelsPerDay),
  }
}

export function topTicks(
  zoom: ZoomLevel,
  start: Date,
  totalDays: number,
  pixelsPerDay: number,
): Tick[] {
  const cfg = headerConfigFor(zoom)
  const out: Tick[] = []
  const end = addDaysUTC(start, totalDays)

  if (cfg.topUnit === "year") {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), 0, 1))
    while (cursor < end) {
      const next = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1))
      const { x, width } = clampedCellWidth(
        start,
        totalDays,
        cursor,
        next,
        pixelsPerDay,
      )
      if (width > 0) {
        out.push({ x, width, label: String(cursor.getUTCFullYear()) })
      }
      cursor.setUTCFullYear(cursor.getUTCFullYear() + 1)
    }
  } else if (cfg.topUnit === "quarter") {
    const startQ = Math.floor(start.getUTCMonth() / 3)
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), startQ * 3, 1))
    while (cursor < end) {
      const next = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1),
      )
      const { x, width } = clampedCellWidth(
        start,
        totalDays,
        cursor,
        next,
        pixelsPerDay,
      )
      if (width > 0) {
        const q = Math.floor(cursor.getUTCMonth() / 3) + 1
        out.push({ x, width, label: `Q${q} ${cursor.getUTCFullYear()}` })
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 3)
    }
  } else {
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    )
    while (cursor < end) {
      const next = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      )
      const { x, width } = clampedCellWidth(
        start,
        totalDays,
        cursor,
        next,
        pixelsPerDay,
      )
      if (width > 0) {
        out.push({
          x,
          width,
          label: `${MONTH_LONG.format(cursor)} ${cursor.getUTCFullYear()}`,
        })
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }
  return out
}

export function bottomTicks(
  zoom: ZoomLevel,
  start: Date,
  totalDays: number,
  pixelsPerDay: number,
): Tick[] {
  const cfg = headerConfigFor(zoom)
  const out: Tick[] = []

  if (cfg.bottomUnit === "day") {
    for (let d = 0; d < totalDays; d++) {
      const date = addDaysUTC(start, d)
      const day = date.getUTCDate()
      const wd = WEEKDAY_SHORT.format(date)
      out.push({
        x: d * pixelsPerDay,
        width: pixelsPerDay,
        label: `${day} ${wd}`,
        tooltip: FULL_DATE.format(date),
        isWeekend: isWeekend(date),
      })
    }
  } else if (cfg.bottomUnit === "week") {
    let cursor = new Date(start.getTime())
    const dow = cursor.getUTCDay() || 7
    if (dow !== 1) cursor = addDaysUTC(cursor, -(dow - 1))
    const end = addDaysUTC(start, totalDays)
    while (cursor < end) {
      const next = addDaysUTC(cursor, 7)
      const { x, width } = clampedCellWidth(
        start,
        totalDays,
        cursor,
        next,
        pixelsPerDay,
      )
      if (width > 0) {
        const { week } = isoWeekNumber(cursor)
        out.push({ x, width, label: `KW ${week}` })
      }
      cursor = next
    }
  } else if (cfg.bottomUnit === "month") {
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    )
    const end = addDaysUTC(start, totalDays)
    while (cursor < end) {
      const next = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      )
      const { x, width } = clampedCellWidth(
        start,
        totalDays,
        cursor,
        next,
        pixelsPerDay,
      )
      if (width > 0) {
        out.push({ x, width, label: MONTH_SHORT.format(cursor) })
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  } else {
    const startQ = Math.floor(start.getUTCMonth() / 3)
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), startQ * 3, 1))
    const end = addDaysUTC(start, totalDays)
    while (cursor < end) {
      const next = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1),
      )
      const { x, width } = clampedCellWidth(
        start,
        totalDays,
        cursor,
        next,
        pixelsPerDay,
      )
      if (width > 0) {
        const q = Math.floor(cursor.getUTCMonth() / 3) + 1
        out.push({ x, width, label: `Q${q}` })
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 3)
    }
  }
  return out
}

/**
 * Vertical grid-line X-coordinates (canvas-area below the header).
 * Density:
 *   day → every day · week → every Monday · month → every 1st ·
 *   quarter → every quarter-start.
 */
export function gridLines(
  zoom: ZoomLevel,
  start: Date,
  totalDays: number,
  pixelsPerDay: number,
): number[] {
  const out: number[] = []

  if (zoom === "day") {
    for (let d = 0; d <= totalDays; d++) out.push(d * pixelsPerDay)
    return out
  }

  if (zoom === "week") {
    let cursor = new Date(start.getTime())
    const dow = cursor.getUTCDay() || 7
    if (dow !== 1) cursor = addDaysUTC(cursor, -(dow - 1))
    while (daysBetween(start, cursor) <= totalDays) {
      const x = daysBetween(start, cursor) * pixelsPerDay
      if (x >= 0) out.push(x)
      cursor = addDaysUTC(cursor, 7)
    }
    return out
  }

  if (zoom === "month") {
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    )
    while (daysBetween(start, cursor) <= totalDays) {
      const x = daysBetween(start, cursor) * pixelsPerDay
      if (x >= 0) out.push(x)
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
    return out
  }

  // quarter
  const startQ = Math.floor(start.getUTCMonth() / 3)
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), startQ * 3, 1))
  while (daysBetween(start, cursor) <= totalDays) {
    const x = daysBetween(start, cursor) * pixelsPerDay
    if (x >= 0) out.push(x)
    cursor.setUTCMonth(cursor.getUTCMonth() + 3)
  }
  return out
}

// PROJ-53-β — Holiday-Bänder.
//
// `date-holidays` is loaded lazily by the caller (`gantt-view.tsx`) and
// the prepared lookup is passed in as `holidayLookup`. Keeping the
// helper pure makes it trivially testable without the library.
export interface HolidayBand {
  x: number
  width: number
  isoDate: string
  name: string
}

/**
 * Lookup contract — caller (gantt-view.tsx) builds a `Map<isoDate, name>`
 * from `date-holidays` for the visible calendar window, filtered to
 * `type === 'public'` (gesetzliche Feiertage). NULL region / no library
 * → caller passes an empty Map → this helper returns no bands.
 */
export type HolidayLookup = ReadonlyMap<string, string>

/**
 * Emit one 1-day-wide band per public holiday that falls within the
 * visible calendar window. The caller paints these in day- and week-
 * zoom only — month- and quarter-zoom collapse them so the helper
 * still returns the bands, but `gantt-view.tsx` gates rendering on
 * the zoom level (matches β-ST-03 acceptance criterion).
 */
export function holidayBandsForRegion(
  start: Date,
  totalDays: number,
  pixelsPerDay: number,
  holidayLookup: HolidayLookup,
): HolidayBand[] {
  if (holidayLookup.size === 0 || totalDays <= 0) return []
  const out: HolidayBand[] = []
  for (let d = 0; d < totalDays; d++) {
    const date = addDaysUTC(start, d)
    const iso =
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
    const name = holidayLookup.get(iso)
    if (!name) continue
    out.push({
      x: d * pixelsPerDay,
      width: pixelsPerDay,
      isoDate: iso,
      name,
    })
  }
  return out
}

/**
 * Pretty-print a holiday cell for the SVG `<title>` tooltip and the
 * screen-reader-accessible `aria-label`. Reuses the `de-DE` long-date
 * formatter from this module so the wording matches the rest of the
 * Gantt copy.
 */
export function formatHolidayTooltip(isoDate: string, name: string): string {
  const [y, m, d] = isoDate.split("-").map(Number)
  if (!y || !m || !d) return name
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${name} · ${FULL_DATE.format(date)}`
}
