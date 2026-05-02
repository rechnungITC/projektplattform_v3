import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-24 ST-07 — GET /api/projects/[id]/cost-summary

const getUserMock = vi.fn()

const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

interface ListResult<T = unknown> {
  data: T[] | null
  error: { message: string } | null
}

function makeListChain(initial: ListResult = { data: [], error: null }) {
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    __result: initial as ListResult,
    then: (resolve: (v: unknown) => void) => resolve(c.__result),
  }
  return c
}

const itemsChain = makeListChain()
const totalsChain = makeListChain()
const phasesChain = makeListChain()
const sprintsChain = makeListChain()
const costLinesChain = makeListChain()

const fromMock = vi.fn((table: string) => {
  if (table === "projects") return projectChain
  if (table === "work_items") return itemsChain
  if (table === "work_item_cost_totals") return totalsChain
  if (table === "phases") return phasesChain
  if (table === "sprints") return sprintsChain
  if (table === "work_item_cost_lines") return costLinesChain
  throw new Error(`unexpected table ${table}`)
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET } from "./route"

const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const EPIC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const STORY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const TASK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const PHASE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const SPRINT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"

function makeReq() {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/cost-summary`)
}
function makeCtx() {
  return { params: Promise.resolve({ id: PROJECT_ID }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const c of [itemsChain, totalsChain, phasesChain, sprintsChain, costLinesChain]) {
    c.select.mockReturnValue(c)
    c.eq.mockReturnValue(c)
    c.in.mockReturnValue(c)
    c.order.mockReturnValue(c)
    c.limit.mockReturnValue(c)
    c.__result = { data: [], error: null }
  }
  projectChain.select.mockReturnValue(projectChain)
  projectChain.eq.mockReturnValue(projectChain)
  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID },
    error: null,
  })
})

describe("GET /api/projects/[id]/cost-summary", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq(), makeCtx())
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid project id", async () => {
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when project is hidden by RLS (cross-project)", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    projectChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(makeReq(), makeCtx())
    expect(res.status).toBe(404)
  })

  it("happy path: returns aggregated buckets per epic / phase / sprint / unsorted", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    itemsChain.__result = {
      data: [
        // Epic root with two descendants
        {
          id: EPIC_ID,
          kind: "epic",
          parent_id: null,
          phase_id: null,
          sprint_id: null,
          title: "Epic 1",
          is_deleted: false,
        },
        {
          id: STORY_ID,
          kind: "story",
          parent_id: EPIC_ID,
          phase_id: PHASE_ID,
          sprint_id: SPRINT_ID,
          title: "Story 1",
          is_deleted: false,
        },
        {
          id: TASK_ID,
          kind: "task",
          parent_id: STORY_ID,
          phase_id: null,
          sprint_id: null,
          title: "Task 1",
          is_deleted: false,
        },
      ],
      error: null,
    }
    totalsChain.__result = {
      data: [
        {
          work_item_id: STORY_ID,
          total_cost: 1000,
          currency: "EUR",
          cost_lines_count: 2,
          multi_currency_count: 1,
        },
        {
          work_item_id: TASK_ID,
          total_cost: 500,
          currency: "EUR",
          cost_lines_count: 1,
          multi_currency_count: 1,
        },
      ],
      error: null,
    }
    phasesChain.__result = {
      data: [{ id: PHASE_ID, name: "Phase A" }],
      error: null,
    }
    sprintsChain.__result = {
      data: [{ id: SPRINT_ID, name: "Sprint 1" }],
      error: null,
    }

    const res = await GET(makeReq(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      by_epic: Array<{
        epic_id: string
        epic_title: string
        buckets: Array<{ currency: string; total: number }>
      }>
      by_phase: Array<{
        phase_id: string
        buckets: Array<{ currency: string; total: number }>
      }>
      by_sprint: Array<{
        sprint_id: string
        buckets: Array<{ currency: string; total: number }>
      }>
      unsorted: { buckets: Array<{ currency: string; total: number }> }
      multi_currency_warning: boolean
    }

    // Epic rolls up Story (1000) + Task (500) = 1500 EUR.
    expect(body.by_epic).toHaveLength(1)
    expect(body.by_epic[0].epic_id).toBe(EPIC_ID)
    expect(body.by_epic[0].buckets).toEqual([
      { currency: "EUR", total: 1500 },
    ])
    // Phase has only the Story = 1000 EUR.
    expect(body.by_phase).toHaveLength(1)
    expect(body.by_phase[0].buckets).toEqual([
      { currency: "EUR", total: 1000 },
    ])
    // Sprint has only the Story = 1000 EUR.
    expect(body.by_sprint).toHaveLength(1)
    expect(body.by_sprint[0].buckets).toEqual([
      { currency: "EUR", total: 1000 },
    ])
    // Unsorted has the Task (no phase, no sprint) = 500 EUR.
    expect(body.unsorted.buckets).toEqual([
      { currency: "EUR", total: 500 },
    ])
    expect(body.multi_currency_warning).toBe(false)
  })

  it("multi_currency_warning=true when an item mixes currencies", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    itemsChain.__result = {
      data: [
        {
          id: STORY_ID,
          kind: "story",
          parent_id: null,
          phase_id: PHASE_ID,
          sprint_id: null,
          title: "Mixed Story",
          is_deleted: false,
        },
      ],
      error: null,
    }
    totalsChain.__result = {
      data: [
        {
          work_item_id: STORY_ID,
          total_cost: 1500,
          currency: "EUR",
          cost_lines_count: 2,
          multi_currency_count: 2,
        },
      ],
      error: null,
    }
    // Multi-currency triggers a re-pull from work_item_cost_lines.
    costLinesChain.__result = {
      data: [
        { work_item_id: STORY_ID, amount: 1000, currency: "EUR" },
        { work_item_id: STORY_ID, amount: 500, currency: "USD" },
      ],
      error: null,
    }
    phasesChain.__result = {
      data: [{ id: PHASE_ID, name: "Phase A" }],
      error: null,
    }

    const res = await GET(makeReq(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      by_phase: Array<{ buckets: Array<{ currency: string; total: number }> }>
      multi_currency_warning: boolean
    }
    expect(body.multi_currency_warning).toBe(true)
    expect(body.by_phase[0].buckets).toHaveLength(2)
    const currencies = body.by_phase[0].buckets.map((b) => b.currency).sort()
    expect(currencies).toEqual(["EUR", "USD"])
  })

  it("returns empty buckets when project has no work items", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
    itemsChain.__result = { data: [], error: null }
    totalsChain.__result = { data: [], error: null }
    phasesChain.__result = { data: [], error: null }
    sprintsChain.__result = { data: [], error: null }

    const res = await GET(makeReq(), makeCtx())
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      by_epic: unknown[]
      by_phase: unknown[]
      by_sprint: unknown[]
      unsorted: { buckets: unknown[] }
      multi_currency_warning: boolean
    }
    expect(body.by_epic).toEqual([])
    expect(body.by_phase).toEqual([])
    expect(body.by_sprint).toEqual([])
    expect(body.unsorted.buckets).toEqual([])
    expect(body.multi_currency_warning).toBe(false)
  })
})
