import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-26 — single-sprint PATCH drift-detection test.

const getUserMock = vi.fn()

const sprintsChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "sprints") return sprintsChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { PATCH } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const SPRINT_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  sprintsChain.select.mockReturnValue(sprintsChain)
  sprintsChain.update.mockReturnValue(sprintsChain)
  sprintsChain.eq.mockReturnValue(sprintsChain)
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
// patchSchema chains TWO `.refine()` calls — non-empty + date range.
function unwrapShape(schema: unknown): Record<string, unknown> {
  let inner = schema as {
    shape?: Record<string, unknown>
    _def?: { schema?: unknown }
  }
  while (!inner.shape && inner._def?.schema) {
    inner = inner._def.schema as typeof inner
  }
  return (inner.shape ?? {}) as Record<string, unknown>
}

describe("PATCH /api/projects/[id]/sprints/[sid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { sprintPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    const schemaKeys = Object.keys(unwrapShape(sprintPatchSchema))

    const kitchenSink: Record<string, unknown> = {
      name: "Drift-Test Sprint",
      goal: "Updated goal.",
      start_date: "2026-01-01",
      end_date: "2026-01-14",
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, ...kitchenSink },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: SPRINT_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = sprintsChain.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
      // Dates are YYYY-MM-DD (not trimmed); only name + goal trim.
      if (typeof expected === "string" && (key === "name" || key === "goal")) {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected.trim() || null
        )
      } else {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected
        )
      }
    }
  })
})
