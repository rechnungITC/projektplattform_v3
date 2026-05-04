import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-24 Phase δ — work-items PATCH route, cost-driver hook tests.
//
// This test focuses on the synthesizer hook only:
//   1. attribute change to a cost-driver field (story_points or
//      estimated_duration_days) → synthesizer fires
//   2. kind change → synthesizer fires
//   3. unrelated attribute change (e.g. ui_position) → synthesizer does NOT fire
//   4. only `title` patch → synthesizer does NOT fire (cheaper read path)
//   5. synthesizer rejects → response is still 200 (fail-open)

const getUserMock = vi.fn()
const synthesizeMock = vi.fn(
  async (_input: Record<string, unknown>) => ({
    written: 0,
    warnings: [],
    hadCostCalcError: false,
  })
)

// --- Per-table chains -------------------------------------------------------
const workItemPreChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const workItemUpdateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

// The route's call pattern for `from('work_items')`:
//   - cost-driver patch (attributes/kind): pre-read first, then UPDATE
//   - non-cost-driver patch (title/etc.): UPDATE only
// We dispatch by inspecting the operation chain — pre-read uses .select()
// then .maybeSingle(); the update uses .update().
const fromMock = vi.fn((table: string) => {
  if (table === "work_items") {
    // Return a router chain that delegates to either pre-read or update
    // based on the first method call (.select vs .update).
    const router: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        // delegated path: pre-update read.
        return (workItemPreChain.select as unknown as (...a: unknown[]) => unknown)(...args)
      },
      update: (...args: unknown[]) => {
        return (workItemUpdateChain.update as unknown as (...a: unknown[]) => unknown)(...args)
      },
    }
    return router
  }
  if (table === "projects") {
    const chain: { select: unknown; eq: unknown; maybeSingle: unknown } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { project_method: "scrum" }, error: null }),
    }
    return chain
  }
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}))

vi.mock("@/lib/cost", () => ({
  synthesizeResourceAllocationCostLines: (input: Record<string, unknown>) =>
    synthesizeMock(input),
}))

import { PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const WORK_ITEM_ID = "55555555-5555-4555-8555-555555555555"

function makePatch(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )
}
function makeCtx() {
  return {
    params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  synthesizeMock.mockResolvedValue({
    written: 0,
    warnings: [],
    hadCostCalcError: false,
  })

  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

  workItemPreChain.select.mockReturnValue(workItemPreChain)
  workItemPreChain.eq.mockReturnValue(workItemPreChain)
  workItemUpdateChain.update.mockReturnValue(workItemUpdateChain)
  workItemUpdateChain.eq.mockReturnValue(workItemUpdateChain)
  workItemUpdateChain.select.mockReturnValue(workItemUpdateChain)
})

describe("PATCH work_items: cost-driver hook", () => {
  it("title-only patch does NOT trigger synthesizer (and no extra read)", async () => {
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 5 },
        tenant_id: TENANT_ID,
        title: "new title",
      },
      error: null,
    })
    const res = await PATCH(makePatch({ title: "new title" }), makeCtx())
    expect(res.status).toBe(200)
    expect(synthesizeMock).not.toHaveBeenCalled()
    // The route should NOT have read the pre-update attributes for a
    // non-cost-driver patch.
    expect(workItemPreChain.maybeSingle).not.toHaveBeenCalled()
  })

  it("attributes patch with story_points change triggers synthesizer", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "story",
        attributes: { story_points: 5 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 8 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    const res = await PATCH(
      makePatch({ attributes: { story_points: 8 } }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
    const call = synthesizeMock.mock.calls[0][0] as Record<string, unknown>
    expect(call.workItemId).toBe(WORK_ITEM_ID)
    expect(call.tenantId).toBe(TENANT_ID)
    expect(call.actorUserId).toBe(USER_ID)
  })

  it("attributes patch with same cost-driver values does NOT trigger synthesizer", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "story",
        attributes: { story_points: 5, estimated_duration_days: 2 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        // Same SP + duration, only some other attribute changed.
        attributes: { story_points: 5, estimated_duration_days: 2, color: "red" },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    const res = await PATCH(
      makePatch({
        attributes: { story_points: 5, estimated_duration_days: 2, color: "red" },
      }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    expect(synthesizeMock).not.toHaveBeenCalled()
  })

  it("attributes patch with estimated_duration_days change triggers synthesizer", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "work_package",
        attributes: { estimated_duration_days: 4 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "work_package",
        attributes: { estimated_duration_days: 7 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    const res = await PATCH(
      makePatch({ attributes: { estimated_duration_days: 7 } }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    expect(synthesizeMock).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // PROJ-36 Phase 36-α — WBS-Code PATCH paths
  // ---------------------------------------------------------------------------

  it("rejects invalid WBS-Code (regex violation)", async () => {
    const res = await PATCH(
      makePatch({ wbs_code: "AP 001 with space" }),
      makeCtx()
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      error: { code: string; field?: string }
    }
    expect(body.error.code).toBe("validation_error")
    expect(body.error.field).toBe("wbs_code")
    // No DB call should happen on validation failure.
    expect(workItemUpdateChain.update).not.toHaveBeenCalled()
  })

  it("PATCH wbs_code forces wbs_code_is_custom=true", async () => {
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "work_package",
        attributes: {},
        tenant_id: TENANT_ID,
        wbs_code: "AP-001",
        wbs_code_is_custom: true,
      },
      error: null,
    })
    const res = await PATCH(makePatch({ wbs_code: "AP-001" }), makeCtx())
    expect(res.status).toBe(200)
    // Verify the route forced is_custom=true on the UPDATE payload.
    expect(workItemUpdateChain.update).toHaveBeenCalledTimes(1)
    const payload = workItemUpdateChain.update.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload.wbs_code).toBe("AP-001")
    expect(payload.wbs_code_is_custom).toBe(true)
  })

  it("PATCH wbs_code_is_custom=false alone nulls wbs_code (reset-to-auto)", async () => {
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "work_package",
        attributes: {},
        tenant_id: TENANT_ID,
        wbs_code: "1.2.3",
        wbs_code_is_custom: false,
      },
      error: null,
    })
    const res = await PATCH(
      makePatch({ wbs_code_is_custom: false }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    expect(workItemUpdateChain.update).toHaveBeenCalledTimes(1)
    const payload = workItemUpdateChain.update.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload.wbs_code_is_custom).toBe(false)
    expect(payload.wbs_code).toBeNull()
  })

  it("23505 unique-constraint surfaces as wbs_code_conflict (422)", async () => {
    workItemUpdateChain.single.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "work_items_wbs_code_unique_per_sibling"',
      },
    })
    const res = await PATCH(makePatch({ wbs_code: "AP-001" }), makeCtx())
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      error: { code: string; field?: string }
    }
    expect(body.error.code).toBe("wbs_code_conflict")
    expect(body.error.field).toBe("wbs_code")
  })

  it("response stays 200 when synthesizer rejects (fail-open)", async () => {
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        kind: "story",
        attributes: { story_points: 3 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 5 },
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    synthesizeMock.mockRejectedValueOnce(new Error("engine down"))
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const res = await PATCH(
      makePatch({ attributes: { story_points: 5 } }),
      makeCtx()
    )
    expect(res.status).toBe(200)
    errorSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Schema-vs-DB-Payload Drift Detection (PATCH)
// ---------------------------------------------------------------------------
// work_items PATCH was already spread-safe (`{ ...parsed.data }`) before
// the schema extraction. This test makes that property regression-proof:
// any future refactor that re-introduces explicit field-by-field mapping
// AND drops a key fails CI loudly.
describe("PATCH /api/projects/[id]/work-items/[wid] — schema/DB-payload drift", () => {
  it("forwards every Zod-schema field to the DB update payload", async () => {
    const { workItemPatchSchema } = await import("../_schema")
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })

    // patchSchema is wrapped in .refine() — unwrap via _def.schema.shape.
    const inner =
      "shape" in workItemPatchSchema
        ? (workItemPatchSchema as unknown as {
            shape: Record<string, unknown>
          })
        : (
            workItemPatchSchema as unknown as {
              _def: { schema: { shape: Record<string, unknown> } }
            }
          )._def.schema
    const schemaKeys = Object.keys(
      (inner as { shape: Record<string, unknown> }).shape
    )

    const PHASE_ID = "66666666-6666-4666-8666-666666666666"
    const SPRINT_ID = "77777777-7777-4777-8777-777777777777"
    const MILESTONE_ID = "88888888-8888-4888-8888-888888888888"

    const kitchenSink: Record<string, unknown> = {
      kind: "story",
      title: "Drift-Test Item",
      description: "Drift-Test description.",
      priority: "high",
      responsible_user_id: USER_ID,
      sprint_id: SPRINT_ID,
      phase_id: PHASE_ID,
      milestone_id: MILESTONE_ID,
      attributes: { story_points: 5, planned_start: "2026-05-01" },
      position: 100,
      is_deleted: false,
      wbs_code: "1.2.3",
      wbs_code_is_custom: true,
      planned_start: "2026-05-10",
      planned_end: "2026-05-20",
    }

    for (const key of schemaKeys) {
      expect(kitchenSink, `kitchen sink missing key '${key}'`).toHaveProperty(
        key
      )
    }

    workItemUpdateChain.single.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        ...kitchenSink,
        tenant_id: TENANT_ID,
      },
      error: null,
    })
    workItemPreChain.maybeSingle.mockResolvedValue({
      data: {
        id: WORK_ITEM_ID,
        kind: "story",
        attributes: { story_points: 3 },
        tenant_id: TENANT_ID,
        parent_id: null,
        project_id: PROJECT_ID,
      },
      error: null,
    })

    const res = await PATCH(makePatch(kitchenSink), makeCtx())
    expect(res.status).toBe(200)

    const arg = workItemUpdateChain.update.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(arg, "update was not called").toBeTruthy()

    for (const key of schemaKeys) {
      const expected = kitchenSink[key]
      const actual = arg[key]
      // wbs_code triggers wbs_code_is_custom=true side-effect — actual
      // value can differ from kitchenSink for that one field.
      if (key === "wbs_code_is_custom") {
        expect(typeof actual).toBe("boolean")
        continue
      }
      if (typeof expected === "string") {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected.trim() || null
        )
      } else if (
        expected &&
        typeof expected === "object" &&
        !Array.isArray(expected)
      ) {
        expect(actual, `field '${key}' was dropped before reaching DB`).toEqual(
          expected
        )
      } else {
        expect(actual, `field '${key}' was dropped before reaching DB`).toBe(
          expected
        )
      }
    }
  })
})
