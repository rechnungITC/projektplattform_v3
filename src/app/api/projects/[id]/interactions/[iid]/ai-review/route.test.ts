import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-γ.2 — Batch AI review PATCH route tests.

const getUserMock = vi.fn()

interface Chain {
  select?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
  in?: ReturnType<typeof vi.fn>
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

import { PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const STAKEHOLDER_ID = "44444444-4444-4444-8444-444444444444"
const INTERACTION_ID = "55555555-5555-4555-8555-555555555555"

function makeReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/interactions/${INTERACTION_ID}/ai-review`,
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

/**
 * Mocks one transition UPDATE on `stakeholder_interaction_participants`.
 * The route awaits a thenable from `.select()` — we satisfy that by
 * making `select` return an object that is awaitable to `{data, error}`.
 */
function enqueueParticipantTransition(captured: {
  update: ReturnType<typeof vi.fn>
}) {
  const thenable = {
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({
        data: [{ stakeholder_id: STAKEHOLDER_ID }],
        error: null,
      }),
  }
  enqueue("stakeholder_interaction_participants", {
    update: captured.update,
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnValue(thenable),
  })
}

function enqueueRefetch(participants: unknown[]) {
  const thenable = {
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: participants, error: null }),
  }
  enqueue("stakeholder_interaction_participants", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((_col: string, _val: string) => {
      // The route chains `.eq().eq()` then awaits. The second `.eq()`
      // returns the thenable.
      return {
        eq: () => thenable,
      }
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("PATCH /api/projects/[id]/interactions/[iid]/ai-review", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(
      makeReq({ decisions: [{ stakeholder_id: STAKEHOLDER_ID, decision: "accept" }] }),
      { params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }) },
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-admin without project role", async () => {
    enqueueAccessForEdit({ isAdmin: false })
    const res = await PATCH(
      makeReq({ decisions: [{ stakeholder_id: STAKEHOLDER_ID, decision: "accept" }] }),
      { params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }) },
    )
    expect(res.status).toBe(403)
  })

  it("returns 400 for empty decisions array", async () => {
    enqueueAccessForEdit()
    const res = await PATCH(makeReq({ decisions: [] }), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 for modify without overrides", async () => {
    enqueueAccessForEdit()
    const res = await PATCH(
      makeReq({
        decisions: [{ stakeholder_id: STAKEHOLDER_ID, decision: "modify" }],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }) },
    )
    expect(res.status).toBe(400)
  })

  it("accepts: sets _source='ai_accepted' on both columns, idempotent WHERE", async () => {
    enqueueAccessForEdit()
    const updateMock = vi.fn().mockReturnThis()
    enqueueParticipantTransition({ update: updateMock })
    enqueueRefetch([])

    const res = await PATCH(
      makeReq({
        decisions: [{ stakeholder_id: STAKEHOLDER_ID, decision: "accept" }],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }) },
    )
    expect(res.status).toBe(200)
    const arg = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.participant_sentiment_source).toBe("ai_accepted")
    expect(arg.participant_cooperation_signal_source).toBe("ai_accepted")
  })

  it("rejects: clears values + sets _source='ai_rejected'", async () => {
    enqueueAccessForEdit()
    const updateMock = vi.fn().mockReturnThis()
    enqueueParticipantTransition({ update: updateMock })
    enqueueRefetch([])

    const res = await PATCH(
      makeReq({
        decisions: [{ stakeholder_id: STAKEHOLDER_ID, decision: "reject" }],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }) },
    )
    expect(res.status).toBe(200)
    const arg = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.participant_sentiment).toBe(null)
    expect(arg.participant_sentiment_source).toBe("ai_rejected")
    expect(arg.participant_cooperation_signal).toBe(null)
    expect(arg.participant_cooperation_signal_source).toBe("ai_rejected")
    // AI provenance erased on reject as well.
    expect(arg.participant_sentiment_provider).toBe(null)
    expect(arg.participant_sentiment_confidence).toBe(null)
  })

  it("modifies: writes override values with _source='manual'", async () => {
    enqueueAccessForEdit()
    const updateMock = vi.fn().mockReturnThis()
    enqueueParticipantTransition({ update: updateMock })
    enqueueRefetch([])

    const res = await PATCH(
      makeReq({
        decisions: [
          {
            stakeholder_id: STAKEHOLDER_ID,
            decision: "modify",
            overrides: { sentiment: 1, cooperation: -1 },
          },
        ],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }) },
    )
    expect(res.status).toBe(200)
    const arg = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.participant_sentiment).toBe(1)
    expect(arg.participant_sentiment_source).toBe("manual")
    expect(arg.participant_cooperation_signal).toBe(-1)
    expect(arg.participant_cooperation_signal_source).toBe("manual")
    expect(arg.participant_sentiment_provider).toBe(null)
  })
})
