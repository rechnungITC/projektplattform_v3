import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-ε.δ — GET coaching recommendations route tests.

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }))

interface Chain {
  select?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
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

import { GET } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const STAKEHOLDER_ID = "44444444-4444-4444-8444-444444444444"

function makeReq(query = ""): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}/coaching-recommendations${query}`,
  )
}

function enqueueAccessForView({ isAdmin = true } = {}) {
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
    maybeSingle: vi.fn().mockResolvedValue({
      data: { role: isAdmin ? "admin" : "member" },
      error: null,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("GET /api/projects/[id]/stakeholders/[sid]/coaching-recommendations", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid review_state query", async () => {
    enqueueAccessForView()
    const res = await GET(makeReq("?review_state=bogus"), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 with empty list", async () => {
    enqueueAccessForView()
    const thenable = {
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    }
    enqueue("stakeholder_coaching_recommendations", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue(thenable),
    })

    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.recommendations).toEqual([])
  })
})
