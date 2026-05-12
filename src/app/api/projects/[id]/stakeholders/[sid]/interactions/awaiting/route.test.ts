import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-δ — Awaiting-responses list for a stakeholder.

const getUserMock = vi.fn()

interface Chain {
  select?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
  in?: ReturnType<typeof vi.fn>
  is?: ReturnType<typeof vi.fn>
  order?: ReturnType<typeof vi.fn>
  limit?: ReturnType<typeof vi.fn>
  maybeSingle?: ReturnType<typeof vi.fn>
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

function makeReq(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}/interactions/awaiting`,
  )
}

function enqueueAccessForView() {
  enqueue("projects", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: PROJECT_ID, tenant_id: TENANT_ID },
      error: null,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("GET /api/projects/[id]/stakeholders/[sid]/interactions/awaiting", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns empty list when stakeholder has no bridge rows", async () => {
    enqueueAccessForView()
    enqueue("stakeholder_interaction_participants", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interactions).toEqual([])
  })

  it("flags overdue based on response_due_date < today", async () => {
    enqueueAccessForView()
    enqueue("stakeholder_interaction_participants", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ interaction_id: "a" }, { interaction_id: "b" }],
        error: null,
      }),
    })
    enqueue("stakeholder_interactions", {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "a",
            channel: "email",
            direction: "outbound",
            interaction_date: "2026-04-10T10:00:00Z",
            summary: "Klärung",
            response_due_date: "2020-01-01", // long overdue
            response_received_date: null,
            created_at: "2026-04-10T10:00:00Z",
          },
          {
            id: "b",
            channel: "email",
            direction: "outbound",
            interaction_date: "2026-05-12T10:00:00Z",
            summary: "Frische Anfrage",
            response_due_date: "2099-12-31", // far future
            response_received_date: null,
            created_at: "2026-05-12T10:00:00Z",
          },
        ],
        error: null,
      }),
    })

    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interactions[0].is_overdue).toBe(true)
    expect(body.interactions[1].is_overdue).toBe(false)
  })
})
