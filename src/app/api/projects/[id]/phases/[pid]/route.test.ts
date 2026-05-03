import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-19 — single-phase PATCH drift-detection test.

const getUserMock = vi.fn()

const phasesChain = {
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
}

const fromMock = vi.fn((table: string) => {
  if (table === "phases") return phasesChain
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
const PHASE_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "33333333-3333-4333-8333-333333333333"

beforeEach(() => {
  vi.clearAllMocks()
  phasesChain.select.mockReturnValue(phasesChain)
  phasesChain.update.mockReturnValue(phasesChain)
  phasesChain.eq.mockReturnValue(phasesChain)
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
describe("PATCH /api/projects/[id]/phases/[pid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { phasePatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in phasePatchSchema
        ? (phasePatchSchema as unknown as { shape: Record<string, unknown> })
        : (
            phasePatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const kitchenSink: Record<string, unknown> = {
      name: "Drift-Test Phase",
      description: "Updated description.",
      planned_start: "2026-01-01",
      planned_end: "2026-12-31",
      actual_start: "2026-01-15",
      actual_end: "2026-12-20",
      is_critical: true,
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    phasesChain.single.mockResolvedValue({
      data: { id: PHASE_ID, ...kitchenSink },
      error: null,
    })

    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kitchenSink),
      }),
      { params: Promise.resolve({ id: PROJECT_ID, pid: PHASE_ID }) }
    )
    expect(res.status).toBe(200)

    const arg = phasesChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
      // Dates are YYYY-MM-DD (not trimmed); is_critical is boolean.
      if (typeof expected === "string" && (key === "name" || key === "description")) {
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
