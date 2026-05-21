import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-65 ε.2 — Stakeholder swap-preview route tests.

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }))

interface Chain {
  select?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
  in?: ReturnType<typeof vi.fn>
  is?: ReturnType<typeof vi.fn>
  order?: ReturnType<typeof vi.fn>
  limit?: ReturnType<typeof vi.fn>
  maybeSingle?: ReturnType<typeof vi.fn>
  then?: ReturnType<typeof vi.fn>
}

const chains: Record<string, Chain[]> = {}
function enqueue(table: string, chain: Chain) {
  ;(chains[table] ??= []).push(chain)
}

const fromMock = vi.fn((table: string) => {
  const next = chains[table]?.shift()
  if (!next) throw new Error(`unexpected/exhausted chain for ${table}`)
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const WORK_ITEM_ID = "33333333-3333-4333-8333-333333333333"
const USER_ID = "44444444-4444-4444-8444-444444444444"
const STAKEHOLDER_A_ID = "55555555-5555-4555-8555-555555555555"
const STAKEHOLDER_B_ID = "66666666-6666-4666-8666-666666666666"

function makeReq(body?: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/stakeholder-swap-preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body == null ? "" : JSON.stringify(body),
    },
  )
}

function enqueueAccess() {
  enqueue("projects", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({
        data: { id: PROJECT_ID, tenant_id: TENANT_ID },
        error: null,
      }),
  })
  enqueue("tenant_memberships", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { role: "admin" }, error: null }),
  })
}

function enqueueWorkItem(found = true) {
  enqueue("work_items", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: found
        ? { id: WORK_ITEM_ID, project_id: PROJECT_ID, kind: "story", title: "X" }
        : null,
      error: null,
    }),
  })
}

function enqueueCurrentAssignees(rows: Array<{ resource_id: string }>) {
  const chain: Chain = {} as Chain
  chain.select = vi.fn().mockReturnValue(chain)
  // First eq() returns chain so the next .eq() works; the second
  // call resolves into the result.
  chain.eq = vi.fn().mockImplementation(() => chain)
  // The route awaits the chain via implicit thenable on the last eq()
  // — emulate Postgrest by attaching `then` directly to the chain.
  ;(chain as Chain & { then?: unknown }).then = (
    resolve: (v: {
      data: Array<{ resource_id: string }>
      error: null
    }) => void,
  ) => resolve({ data: rows, error: null })
  enqueue("work_item_resources", chain)
}

function enqueueCandidates(
  candidates: Array<{
    id: string
    name: string
    role_key: string | null
    influence: string | null
    impact: string | null
  }>,
) {
  const rows = candidates.map((c) => ({
    ...c,
    kind: "person",
    is_active: true,
  }))
  enqueue("stakeholders", thenableChain(rows))
}

function thenableChain(data: unknown[]): Chain {
  const chain: Chain = {} as Chain
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  ;(chain as Chain & { then?: unknown }).then = (
    resolve: (v: { data: unknown[]; error: null }) => void,
  ) => resolve({ data, error: null })
  return chain
}

function enqueueEmptyResources() {
  enqueue("resources", thenableChain([]))
}

function enqueueEmptyDependencies() {
  enqueue("dependencies", thenableChain([]))
  enqueue("dependencies", thenableChain([]))
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("POST /api/projects/[id]/work-items/[wid]/stakeholder-swap-preview", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 when project id is not a UUID", async () => {
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: "not-a-uuid", wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when work-item id is not a UUID", async () => {
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, wid: "bad" }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when body is invalid JSON", async () => {
    const req = new Request(
      `http://localhost/api/projects/${PROJECT_ID}/work-items/${WORK_ITEM_ID}/stakeholder-swap-preview`,
      { method: "POST", body: "{not-json" },
    )
    const res = await POST(req, {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when work item does not exist in this project", async () => {
    enqueueAccess()
    enqueueWorkItem(false)
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with masked candidates and cost_clear_view=false (default)", async () => {
    enqueueAccess()
    enqueueWorkItem(true)
    enqueueCurrentAssignees([])
    enqueueCandidates([
      {
        id: STAKEHOLDER_A_ID,
        name: "A. Müller",
        role_key: "Senior BA",
        influence: "high",
        impact: "medium",
      },
      {
        id: STAKEHOLDER_B_ID,
        name: "B. Schulze",
        role_key: "BA",
        influence: "low",
        impact: "low",
      },
    ])
    enqueueEmptyResources()
    enqueueEmptyDependencies()

    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      candidates: Array<{
        stakeholder_id: string
        name: string
        cost_delta: { kind: string; bucket?: string }
        time_delta_days: number | null
        risk_delta: { kind: string }
        followup_count: number
      }>
      cost_clear_view: boolean
    }
    expect(body.cost_clear_view).toBe(false)
    expect(body.candidates).toHaveLength(2)
    // Every cost_delta is aggregate (Class-3 masked until L6).
    for (const c of body.candidates) {
      expect(c.cost_delta.kind).toBe("aggregate")
      expect(typeof c.time_delta_days).toBe("number")
      expect(c.followup_count).toBe(0)
    }
  })

  it("rejects extra body fields per strict Zod schema", async () => {
    const res = await POST(makeReq({ rogue: true }), {
      params: Promise.resolve({ id: PROJECT_ID, wid: WORK_ITEM_ID }),
    })
    expect(res.status).toBe(400)
  })
})
