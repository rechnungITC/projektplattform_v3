import { beforeEach, describe, expect, it, vi } from "vitest"

// -----------------------------------------------------------------------------
// Mocks — PROJ-25b bulk sprint assignment
// -----------------------------------------------------------------------------
// Three chains live behind `from(...)`:
//   • sprintsChain      — sprint state guard, terminates at .maybeSingle()
//   • workItemsMatch    — pre-flight ID/kind check, terminates as thenable
//                         after `.eq(project_id, …)`
//   • workItemsUpdate   — atomic update, terminates as thenable after `.select()`
//
// We track a mutable `nextWorkItems` flag so the same `from("work_items")`
// call returns the right chain depending on whether we're in the pre-flight
// phase (set to "match") or the update phase (set to "update").

const getUserMock = vi.fn()

const sprintsChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

interface ThenableChain {
  __result: { data: unknown[] | null; error: { message: string; code?: string } | null }
  then: (resolve: (v: unknown) => void) => void
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
}

const workItemsMatch: ThenableChain = {
  __result: { data: [], error: null },
  // Flip the dispatcher to "update" once the pre-flight match resolves —
  // the very next `from("work_items")` (the atomic UPDATE) will land on
  // the update chain.
  then: (resolve) => {
    nextWorkItems = "update"
    resolve(workItemsMatch.__result)
  },
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
}

const workItemsUpdate: ThenableChain = {
  __result: { data: [], error: null },
  then: (resolve) => resolve(workItemsUpdate.__result),
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
}

let nextWorkItems: "match" | "update" = "match"

const fromMock = vi.fn((table: string) => {
  if (table === "sprints") return sprintsChain
  if (table === "work_items") {
    return nextWorkItems === "match" ? workItemsMatch : workItemsUpdate
  }
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { PATCH } from "./route"

// -----------------------------------------------------------------------------

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const SPRINT_ID = "33333333-3333-4333-8333-333333333333"
const CLOSED_SPRINT_ID = "44444444-4444-4444-8444-444444444444"
const USER_ID = "55555555-5555-4555-8555-555555555555"
const STORY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const STORY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const STORY_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const FOREIGN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff"

function makeReq(body: unknown, projectId: string = PROJECT_ID): Request {
  return new Request(
    `http://localhost/api/projects/${projectId}/work-items/sprint-bulk`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  nextWorkItems = "match"

  sprintsChain.select.mockReturnValue(sprintsChain)
  sprintsChain.eq.mockReturnValue(sprintsChain)

  workItemsMatch.select.mockReturnValue(workItemsMatch)
  workItemsMatch.update.mockReturnValue(workItemsMatch)
  workItemsMatch.in.mockReturnValue(workItemsMatch)
  workItemsMatch.eq.mockReturnValue(workItemsMatch)
  workItemsMatch.__result = { data: [], error: null }

  workItemsUpdate.select.mockReturnValue(workItemsUpdate)
  workItemsUpdate.update.mockReturnValue(workItemsUpdate)
  workItemsUpdate.in.mockReturnValue(workItemsUpdate)
  workItemsUpdate.eq.mockReturnValue(workItemsUpdate)
  workItemsUpdate.__result = { data: [], error: null }
})

// -----------------------------------------------------------------------------
// Auth + body validation
// -----------------------------------------------------------------------------

describe("PATCH /api/projects/[id]/work-items/sprint-bulk — auth & body", () => {
  it("returns 400 on invalid project id", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(makeReq({ work_item_ids: [STORY_A], sprint_id: null }, "not-a-uuid"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 400 on non-JSON body", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(
      new Request(`http://localhost/x`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not-json{",
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_body")
  })

  it("returns 400 on empty work_item_ids", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(makeReq({ work_item_ids: [], sprint_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
    expect(body.error.field).toBe("work_item_ids")
  })

  it("returns 400 on > 50 work_item_ids", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const ids = Array.from(
      { length: 51 },
      (_, i) =>
        `${i.toString(16).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    )
    const res = await PATCH(makeReq({ work_item_ids: ids, sprint_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 400 on non-UUID id in array", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await PATCH(makeReq({ work_item_ids: ["nope"], sprint_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("validation_error")
  })

  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeReq({ work_item_ids: [STORY_A], sprint_id: null }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(res.status).toBe(401)
  })
})

// -----------------------------------------------------------------------------
// Sprint guards
// -----------------------------------------------------------------------------

describe("PATCH sprint-bulk — sprint guards", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  it("returns 422 invalid_sprint when sprint not found", async () => {
    sprintsChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await PATCH(
      makeReq({ work_item_ids: [STORY_A], sprint_id: SPRINT_ID }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_sprint")
  })

  it("returns 422 invalid_sprint when sprint belongs to another project", async () => {
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: OTHER_PROJECT_ID, state: "planned" },
      error: null,
    })
    const res = await PATCH(
      makeReq({ work_item_ids: [STORY_A], sprint_id: SPRINT_ID }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_sprint")
  })

  it("returns 422 sprint_closed when target sprint is closed", async () => {
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: CLOSED_SPRINT_ID, project_id: PROJECT_ID, state: "closed" },
      error: null,
    })
    const res = await PATCH(
      makeReq({ work_item_ids: [STORY_A], sprint_id: CLOSED_SPRINT_ID }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("sprint_closed")
    expect(body.error.field).toBe("sprint_id")
    // Update must NOT have been called.
    expect(workItemsUpdate.update).not.toHaveBeenCalled()
  })

  it("skips sprint lookup when sprint_id is null (detach-from-sprint)", async () => {
    workItemsMatch.__result = {
      data: [
        { id: STORY_A, kind: "story" },
        { id: STORY_B, kind: "story" },
      ],
      error: null,
    }
    workItemsUpdate.__result = {
      data: [
        { id: STORY_A, sprint_id: null },
        { id: STORY_B, sprint_id: null },
      ],
      error: null,
    }

    const res = await PATCH(
      makeReq({ work_item_ids: [STORY_A, STORY_B], sprint_id: null }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    expect(sprintsChain.select).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.updated).toBe(2)
  })
})

// -----------------------------------------------------------------------------
// Pre-flight match (kind + cross-project guard)
// -----------------------------------------------------------------------------

describe("PATCH sprint-bulk — pre-flight match", () => {
  beforeEach(() => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID, state: "active" },
      error: null,
    })
  })

  it("returns 422 items_not_found with failed_ids when an ID is missing/foreign", async () => {
    // Two requested, only one matches → the other is reported as missing.
    workItemsMatch.__result = {
      data: [{ id: STORY_A, kind: "story" }],
      error: null,
    }
    const res = await PATCH(
      makeReq({ work_item_ids: [STORY_A, FOREIGN_ID], sprint_id: SPRINT_ID }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("items_not_found")
    expect(body.failed_ids).toEqual([FOREIGN_ID])
    // Update must NOT have been called.
    expect(workItemsUpdate.update).not.toHaveBeenCalled()
  })

  it("returns 422 invalid_kind when a non-story slips through", async () => {
    workItemsMatch.__result = {
      data: [
        { id: STORY_A, kind: "story" },
        { id: STORY_B, kind: "epic" },
      ],
      error: null,
    }
    const res = await PATCH(
      makeReq({ work_item_ids: [STORY_A, STORY_B], sprint_id: SPRINT_ID }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error.code).toBe("invalid_kind")
    expect(body.failed_ids).toEqual([STORY_B])
    expect(workItemsUpdate.update).not.toHaveBeenCalled()
  })

  it("dedupes repeated work_item_ids before counting", async () => {
    workItemsMatch.__result = {
      data: [{ id: STORY_A, kind: "story" }],
      error: null,
    }
    workItemsUpdate.__result = {
      data: [{ id: STORY_A, sprint_id: SPRINT_ID }],
      error: null,
    }
    // STORY_A passed three times → de-duped to one.
    const res = await PATCH(
      makeReq({
        work_item_ids: [STORY_A, STORY_A, STORY_A],
        sprint_id: SPRINT_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(1)
  })
})

// -----------------------------------------------------------------------------
// Happy path
// -----------------------------------------------------------------------------

describe("PATCH sprint-bulk — happy path", () => {
  it("attaches three stories to a planned sprint atomically", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID, state: "planned" },
      error: null,
    })
    workItemsMatch.__result = {
      data: [
        { id: STORY_A, kind: "story" },
        { id: STORY_B, kind: "story" },
        { id: STORY_C, kind: "story" },
      ],
      error: null,
    }
    workItemsUpdate.__result = {
      data: [
        { id: STORY_A, sprint_id: SPRINT_ID },
        { id: STORY_B, sprint_id: SPRINT_ID },
        { id: STORY_C, sprint_id: SPRINT_ID },
      ],
      error: null,
    }

    const res = await PATCH(
      makeReq({
        work_item_ids: [STORY_A, STORY_B, STORY_C],
        sprint_id: SPRINT_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(3)
    expect(body.work_items).toHaveLength(3)

    // The atomic UPDATE was called exactly once with sprint_id.
    expect(workItemsUpdate.update).toHaveBeenCalledTimes(1)
    expect(workItemsUpdate.update).toHaveBeenCalledWith({
      sprint_id: SPRINT_ID,
    })
  })
})

// -----------------------------------------------------------------------------
// RLS short row
// -----------------------------------------------------------------------------

describe("PATCH sprint-bulk — RLS short-row", () => {
  it("returns 403 when RLS silently filters one of the rows on update", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    sprintsChain.maybeSingle.mockResolvedValue({
      data: { id: SPRINT_ID, project_id: PROJECT_ID, state: "active" },
      error: null,
    })
    workItemsMatch.__result = {
      data: [
        { id: STORY_A, kind: "story" },
        { id: STORY_B, kind: "story" },
      ],
      error: null,
    }
    // RLS denies one row silently — only STORY_A returned.
    workItemsUpdate.__result = {
      data: [{ id: STORY_A, sprint_id: SPRINT_ID }],
      error: null,
    }

    const res = await PATCH(
      makeReq({
        work_item_ids: [STORY_A, STORY_B],
        sprint_id: SPRINT_ID,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) }
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe("forbidden")
  })
})
