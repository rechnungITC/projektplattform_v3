import { afterEach, describe, expect, it, vi } from "vitest"

import {
  EMPTY_TASK_BOTTLENECK_SUMMARY,
  fetchTaskBottlenecks,
  taskBottlenecksExportUrl,
} from "./task-bottlenecks"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("taskBottlenecksExportUrl", () => {
  it("builds the encoded export URL", () => {
    expect(taskBottlenecksExportUrl(PROJECT)).toBe(
      `/api/projects/${PROJECT}/task-bottlenecks/export`
    )
  })
})

describe("fetchTaskBottlenecks", () => {
  it("normalises NULL boolean flags to false and coerces days_overdue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tasks: [
            {
              id: "w1",
              title: "Blocked, no due",
              is_overdue: null,
              is_due_today: null,
              is_due_this_week: null,
              is_blocked: true,
              days_overdue: null,
            },
          ],
          top_bottlenecks: [],
          summary: {
            open_total: 1,
            overdue_total: 0,
            due_today_total: 0,
            due_this_week_total: 0,
            blocked_total: 1,
          },
        }),
      })
    )
    const out = await fetchTaskBottlenecks(PROJECT)
    const t = out.tasks[0]
    expect(t.is_overdue).toBe(false)
    expect(t.is_due_today).toBe(false)
    expect(t.is_due_this_week).toBe(false)
    expect(t.is_blocked).toBe(true)
    expect(t.days_overdue).toBe(0)
    expect(out.summary.blocked_total).toBe(1)
  })

  it("falls back to an empty overview when fields are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    )
    const out = await fetchTaskBottlenecks(PROJECT)
    expect(out.tasks).toEqual([])
    expect(out.top_bottlenecks).toEqual([])
    expect(out.summary).toEqual(EMPTY_TASK_BOTTLENECK_SUMMARY)
  })

  it("throws with the server error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "kaputt" } }),
      })
    )
    await expect(fetchTaskBottlenecks(PROJECT)).rejects.toThrow("kaputt")
  })
})
