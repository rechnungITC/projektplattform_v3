import { describe, expect, it } from "vitest"

import {
  bottomTicks,
  gridLines,
  headerConfigFor,
  isoWeekNumber,
  isWeekend,
  quarterOf,
  topTicks,
  weekendBands,
} from "./gantt-timeline"

describe("isoWeekNumber", () => {
  it("returns KW 1 / 2025 for 2024-12-30 (Monday of the week containing 2025-01-02)", () => {
    expect(isoWeekNumber(new Date(Date.UTC(2024, 11, 30)))).toEqual({
      year: 2025,
      week: 1,
    })
  })

  it("returns KW 53 / 2026 for 2027-01-01 (Friday at end of long ISO year)", () => {
    expect(isoWeekNumber(new Date(Date.UTC(2027, 0, 1)))).toEqual({
      year: 2026,
      week: 53,
    })
  })

  it("returns KW 18 / 2026 for 2026-05-01", () => {
    expect(isoWeekNumber(new Date(Date.UTC(2026, 4, 1)))).toEqual({
      year: 2026,
      week: 18,
    })
  })

  it("handles leap-year date 2024-02-29", () => {
    const r = isoWeekNumber(new Date(Date.UTC(2024, 1, 29)))
    expect(r.year).toBe(2024)
    expect(r.week).toBe(9)
  })

  it("returns KW 1 / 2026 for 2025-12-29 (Monday)", () => {
    expect(isoWeekNumber(new Date(Date.UTC(2025, 11, 29)))).toEqual({
      year: 2026,
      week: 1,
    })
  })
})

describe("isWeekend", () => {
  it("flags Saturday 2026-05-02", () => {
    expect(isWeekend(new Date(Date.UTC(2026, 4, 2)))).toBe(true)
  })
  it("flags Sunday 2026-05-03", () => {
    expect(isWeekend(new Date(Date.UTC(2026, 4, 3)))).toBe(true)
  })
  it("rejects Friday 2026-05-01", () => {
    expect(isWeekend(new Date(Date.UTC(2026, 4, 1)))).toBe(false)
  })
  it("rejects Monday 2026-05-04", () => {
    expect(isWeekend(new Date(Date.UTC(2026, 4, 4)))).toBe(false)
  })
})

describe("quarterOf", () => {
  it.each([
    [Date.UTC(2026, 0, 1), 1],
    [Date.UTC(2026, 2, 31), 1],
    [Date.UTC(2026, 3, 1), 2],
    [Date.UTC(2026, 6, 1), 3],
    [Date.UTC(2026, 11, 31), 4],
  ])("returns the correct quarter (%i → Q%i)", (input, expected) => {
    expect(quarterOf(new Date(input)).quarter).toBe(expected)
  })
})

describe("headerConfigFor", () => {
  it("day-zoom: top=month, bottom=day, weekends + day-grid on", () => {
    const c = headerConfigFor("day")
    expect(c).toMatchObject({
      topUnit: "month",
      bottomUnit: "day",
      showWeekends: true,
      showDayGrid: true,
    })
  })
  it("week-zoom: top=month, bottom=week, weekends on, day-grid off", () => {
    const c = headerConfigFor("week")
    expect(c).toMatchObject({
      topUnit: "month",
      bottomUnit: "week",
      showWeekends: true,
      showDayGrid: false,
    })
  })
  it("month-zoom: top=quarter, bottom=month, no weekends, no day-grid", () => {
    const c = headerConfigFor("month")
    expect(c).toMatchObject({
      topUnit: "quarter",
      bottomUnit: "month",
      showWeekends: false,
      showDayGrid: false,
    })
  })
  it("quarter-zoom: top=year, bottom=quarter, no weekends", () => {
    const c = headerConfigFor("quarter")
    expect(c).toMatchObject({
      topUnit: "year",
      bottomUnit: "quarter",
      showWeekends: false,
    })
  })
})

describe("weekendBands", () => {
  it("coalesces Sat + Sun into a single 2-day band", () => {
    // 2026-05-01 Fri, 7 days: Fr Sa Su Mo Tu We Th
    const bands = weekendBands(new Date(Date.UTC(2026, 4, 1)), 7, 10)
    expect(bands).toEqual([{ x: 10, width: 20 }])
  })

  it("emits a stand-alone Sun band when window starts on Sunday", () => {
    // 2026-05-03 Su, 5 days: Su Mo Tu We Th
    const bands = weekendBands(new Date(Date.UTC(2026, 4, 3)), 5, 10)
    expect(bands).toEqual([{ x: 0, width: 10 }])
  })

  it("emits no bands when window has no weekend days", () => {
    // 2026-05-04 Mo, 5 days: Mo Tu We Th Fr
    const bands = weekendBands(new Date(Date.UTC(2026, 4, 4)), 5, 10)
    expect(bands).toEqual([])
  })

  it("clamps the trailing Sat-only band to window end", () => {
    // 2026-05-01 Fri, only 2 days: Fr Sa (no following Sun)
    const bands = weekendBands(new Date(Date.UTC(2026, 4, 1)), 2, 10)
    expect(bands).toEqual([{ x: 10, width: 10 }])
  })

  it("emits one band per weekend across a multi-week window", () => {
    // 2026-05-01 Fri, 14 days: Fr|SaSu|MoTuWeThFr|SaSu|MoTuWeTh
    const bands = weekendBands(new Date(Date.UTC(2026, 4, 1)), 14, 10)
    expect(bands).toEqual([
      { x: 10, width: 20 },
      { x: 80, width: 20 },
    ])
  })
})

describe("topTicks", () => {
  it("day-zoom emits month ticks labelled 'Mai 2026'", () => {
    const ticks = topTicks("day", new Date(Date.UTC(2026, 3, 25)), 30, 10)
    expect(ticks).toHaveLength(2)
    expect(ticks[0].label).toBe("April 2026")
    expect(ticks[1].label).toBe("Mai 2026")
  })

  it("month-zoom emits quarter ticks labelled 'Q2 2026'", () => {
    const ticks = topTicks("month", new Date(Date.UTC(2026, 3, 1)), 60, 5)
    expect(ticks[0].label).toBe("Q2 2026")
  })

  it("quarter-zoom emits year ticks labelled '2026'", () => {
    const ticks = topTicks("quarter", new Date(Date.UTC(2026, 0, 1)), 365, 1)
    expect(ticks[0].label).toBe("2026")
  })
})

describe("bottomTicks", () => {
  it("day-zoom: '1 Fr', '2 Sa', '3 So' (de-DE weekdays) with full-date tooltip", () => {
    const ticks = bottomTicks("day", new Date(Date.UTC(2026, 4, 1)), 3, 40)
    expect(ticks).toHaveLength(3)
    expect(ticks[0].label).toMatch(/^1\s+Fr/)
    expect(ticks[1].label).toMatch(/^2\s+Sa/)
    expect(ticks[2].label).toMatch(/^3\s+So/)
    expect(ticks[1].isWeekend).toBe(true)
    expect(ticks[0].tooltip).toContain("1. Mai 2026")
  })

  it("week-zoom: emits 'KW NN' labels keyed off the ISO Monday", () => {
    const ticks = bottomTicks("week", new Date(Date.UTC(2026, 4, 1)), 14, 16)
    expect(ticks[0].label).toBe("KW 18")
    expect(ticks.some((t) => t.label === "KW 19")).toBe(true)
  })

  it("month-zoom: emits short-month labels 'Mai', 'Jun'", () => {
    const ticks = bottomTicks("month", new Date(Date.UTC(2026, 4, 1)), 60, 6)
    expect(ticks.map((t) => t.label)).toEqual(
      expect.arrayContaining(["Mai", "Jun"]),
    )
  })

  it("quarter-zoom: emits 'Q1', 'Q2', 'Q3', 'Q4'", () => {
    const ticks = bottomTicks(
      "quarter",
      new Date(Date.UTC(2026, 0, 1)),
      365,
      2,
    )
    expect(ticks.map((t) => t.label)).toEqual(
      expect.arrayContaining(["Q1", "Q2", "Q3", "Q4"]),
    )
  })
})

describe("gridLines", () => {
  it("day-zoom emits one line per day boundary", () => {
    expect(gridLines("day", new Date(Date.UTC(2026, 4, 1)), 7, 10)).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70,
    ])
  })

  it("week-zoom emits one line per ISO Monday inside the window", () => {
    // 2026-05-01 = Friday → next Mondays are 2026-05-04 (x=30) and 2026-05-11 (x=100).
    const lines = gridLines("week", new Date(Date.UTC(2026, 4, 1)), 14, 10)
    expect(lines).toContain(30)
    expect(lines).toContain(100)
    expect(lines.every((x) => x >= 0)).toBe(true)
  })

  it("month-zoom emits one line per month-start inside the window", () => {
    const lines = gridLines("month", new Date(Date.UTC(2026, 3, 25)), 90, 5)
    // 2026-05-01 (x = 6 days * 5 = 30), 2026-06-01 (x = 37 * 5 = 185)
    expect(lines).toContain(30)
    expect(lines).toContain(185)
  })

  it("quarter-zoom emits one line per quarter-start inside the window", () => {
    const lines = gridLines(
      "quarter",
      new Date(Date.UTC(2026, 0, 1)),
      400,
      2,
    )
    // 2026-04-01 = day 90 → x=180; 2026-07-01 = day 181 → x=362
    expect(lines).toContain(180)
    expect(lines).toContain(362)
  })
})
