import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-γ.2 — Sentiment-trigger POST route tests.

const { getUserMock, invokeSentimentGenerationMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  invokeSentimentGenerationMock: vi.fn(),
}))

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
vi.mock("@/lib/ai/router", () => ({
  invokeSentimentGeneration: invokeSentimentGenerationMock,
}))

import { POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const STAKEHOLDER_ID = "44444444-4444-4444-8444-444444444444"
const INTERACTION_ID = "55555555-5555-4555-8555-555555555555"

function makeReq(): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/interactions/${INTERACTION_ID}/sentiment-trigger`,
    { method: "POST" },
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

function enqueueInteractionLoad({
  found = true,
  deleted = false,
}: { found?: boolean; deleted?: boolean } = {}) {
  enqueue("stakeholder_interactions", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: found
        ? {
            id: INTERACTION_ID,
            summary: "Sprint-Planning mit Key-Usern",
            deleted_at: deleted ? new Date().toISOString() : null,
          }
        : null,
      error: null,
    }),
  })
}

function enqueueParticipantsLoad(stakeholderIds: string[]) {
  const thenable = {
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({
        data: stakeholderIds.map((id) => ({ stakeholder_id: id })),
        error: null,
      }),
  }
  enqueue("stakeholder_interaction_participants", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(() => ({ eq: () => thenable })),
  })
}

function enqueueStakeholderNames(rows: Array<{ id: string; name: string }>) {
  const thenable = {
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  }
  enqueue("stakeholders", {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnValue(thenable),
  })
}

function enqueueParticipantWrite() {
  enqueue("stakeholder_interaction_participants", {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { stakeholder_id: STAKEHOLDER_ID },
      error: null,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  invokeSentimentGenerationMock.mockReset()
})

describe("POST /api/projects/[id]/interactions/[iid]/sentiment-trigger", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-admin without project role", async () => {
    enqueueAccessForEdit({ isAdmin: false })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 404 when interaction is soft-deleted", async () => {
    enqueueAccessForEdit()
    enqueueInteractionLoad({ deleted: true })
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when interaction has no participants", async () => {
    enqueueAccessForEdit()
    enqueueInteractionLoad()
    enqueueParticipantsLoad([])
    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("writes ai_proposed rows on success and returns confidence_avg", async () => {
    enqueueAccessForEdit()
    enqueueInteractionLoad()
    enqueueParticipantsLoad([STAKEHOLDER_ID])
    enqueueStakeholderNames([{ id: STAKEHOLDER_ID, name: "A. Schmidt" }])
    enqueueParticipantWrite()
    invokeSentimentGenerationMock.mockResolvedValue({
      run_id: "run-1",
      classification: 3,
      provider: "anthropic",
      model_id: "claude-opus-4-7",
      status: "success",
      external_blocked: false,
      signals: [
        {
          stakeholder_id: STAKEHOLDER_ID,
          sentiment: 1,
          cooperation_signal: 2,
          confidence: 0.73,
        },
      ],
    })

    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.run.provider).toBe("anthropic")
    expect(body.run.status).toBe("success")
    expect(body.run.confidence_avg).toBeCloseTo(0.73, 2)
  })

  it("returns external_blocked metadata without writing rows", async () => {
    enqueueAccessForEdit()
    enqueueInteractionLoad()
    enqueueParticipantsLoad([STAKEHOLDER_ID])
    enqueueStakeholderNames([{ id: STAKEHOLDER_ID, name: "A. Schmidt" }])
    invokeSentimentGenerationMock.mockResolvedValue({
      run_id: "run-2",
      classification: 3,
      provider: "stub",
      model_id: null,
      status: "external_blocked",
      external_blocked: true,
      signals: [],
    })

    const res = await POST(makeReq(), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.run.status).toBe("external_blocked")
    expect(body.run.confidence_avg).toBeNull()
  })
})
