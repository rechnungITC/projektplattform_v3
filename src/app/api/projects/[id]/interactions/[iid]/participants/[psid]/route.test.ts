import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-β — Per-participant manual signal PATCH route tests.

const getUserMock = vi.fn()

interface Chain {
  select?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
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

import { PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const STAKEHOLDER_ID = "44444444-4444-4444-8444-444444444444"
const INTERACTION_ID = "55555555-5555-4555-8555-555555555555"

function makeReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/interactions/${INTERACTION_ID}/participants/${STAKEHOLDER_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

function enqueueAccessForEdit({ isAdmin = true } = {}) {
  enqueue("projects", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
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
  enqueue("project_memberships", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("PATCH /api/projects/[id]/interactions/[iid]/participants/[psid]", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeReq({ participant_sentiment: 1 }), {
      params: Promise.resolve({
        id: PROJECT_ID,
        iid: INTERACTION_ID,
        psid: STAKEHOLDER_ID,
      }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-admin without project role", async () => {
    enqueueAccessForEdit({ isAdmin: false })
    const res = await PATCH(makeReq({ participant_sentiment: 1 }), {
      params: Promise.resolve({
        id: PROJECT_ID,
        iid: INTERACTION_ID,
        psid: STAKEHOLDER_ID,
      }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 400 when neither field is provided", async () => {
    enqueueAccessForEdit()
    const res = await PATCH(makeReq({}), {
      params: Promise.resolve({
        id: PROJECT_ID,
        iid: INTERACTION_ID,
        psid: STAKEHOLDER_ID,
      }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 for sentiment out of range", async () => {
    enqueueAccessForEdit()
    const res = await PATCH(makeReq({ participant_sentiment: 5 }), {
      params: Promise.resolve({
        id: PROJECT_ID,
        iid: INTERACTION_ID,
        psid: STAKEHOLDER_ID,
      }),
    })
    expect(res.status).toBe(400)
  })

  it("forces source='manual' when sentiment is set", async () => {
    enqueueAccessForEdit()
    const updateMock = vi.fn().mockReturnThis()
    enqueue("stakeholder_interaction_participants", {
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          interaction_id: INTERACTION_ID,
          stakeholder_id: STAKEHOLDER_ID,
          participant_sentiment: 2,
          participant_sentiment_source: "manual",
          participant_cooperation_signal: null,
          participant_cooperation_signal_source: null,
        },
        error: null,
      }),
    })

    const res = await PATCH(makeReq({ participant_sentiment: 2 }), {
      params: Promise.resolve({
        id: PROJECT_ID,
        iid: INTERACTION_ID,
        psid: STAKEHOLDER_ID,
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.participant.participant_sentiment).toBe(2)
    expect(body.participant.participant_sentiment_source).toBe("manual")
    // Source forced to "manual" for non-null sentiment.
    const arg = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.participant_sentiment_source).toBe("manual")
    expect(arg.participant_sentiment_model).toBe(null)
  })

  it("clears source when sentiment is set to null", async () => {
    enqueueAccessForEdit()
    const updateMock = vi.fn().mockReturnThis()
    enqueue("stakeholder_interaction_participants", {
      update: updateMock,
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          interaction_id: INTERACTION_ID,
          stakeholder_id: STAKEHOLDER_ID,
          participant_sentiment: null,
          participant_sentiment_source: null,
          participant_cooperation_signal: null,
          participant_cooperation_signal_source: null,
        },
        error: null,
      }),
    })

    const res = await PATCH(makeReq({ participant_sentiment: null }), {
      params: Promise.resolve({
        id: PROJECT_ID,
        iid: INTERACTION_ID,
        psid: STAKEHOLDER_ID,
      }),
    })
    expect(res.status).toBe(200)
    const arg = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.participant_sentiment_source).toBe(null)
  })

  it("returns 404 when participant is missing", async () => {
    enqueueAccessForEdit()
    enqueue("stakeholder_interaction_participants", {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    const res = await PATCH(makeReq({ participant_sentiment: 1 }), {
      params: Promise.resolve({
        id: PROJECT_ID,
        iid: INTERACTION_ID,
        psid: STAKEHOLDER_ID,
      }),
    })
    expect(res.status).toBe(404)
  })
})
