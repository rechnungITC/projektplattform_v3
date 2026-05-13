import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-ε.δ — PATCH coaching review-batch route tests.

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }))

interface Chain {
  select?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
  is?: ReturnType<typeof vi.fn>
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
const REC_ID = "55555555-5555-4555-8555-555555555555"

function makeReq(body: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}/coaching-recommendations/review`,
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

function enqueueUpdate(captured: { update: ReturnType<typeof vi.fn> }) {
  const thenable = {
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: [{ id: REC_ID }], error: null }),
  }
  enqueue("stakeholder_coaching_recommendations", {
    update: captured.update,
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnValue(thenable),
  })
}

function enqueueRefetch(rows: unknown[]) {
  const thenable = {
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  }
  enqueue("stakeholder_coaching_recommendations", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(() => ({
      eq: () => ({ in: () => thenable }),
    })),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("PATCH .../coaching-recommendations/review", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(
      makeReq({
        decisions: [{ recommendation_id: REC_ID, decision: "accept" }],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }) },
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-admin without project role", async () => {
    enqueueAccessForEdit({ isAdmin: false })
    const res = await PATCH(
      makeReq({
        decisions: [{ recommendation_id: REC_ID, decision: "accept" }],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }) },
    )
    expect(res.status).toBe(403)
  })

  it("returns 400 when modify decision lacks modified_text", async () => {
    enqueueAccessForEdit()
    const res = await PATCH(
      makeReq({
        decisions: [{ recommendation_id: REC_ID, decision: "modify" }],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }) },
    )
    expect(res.status).toBe(400)
  })

  it("accept: writes review_state='accepted'", async () => {
    enqueueAccessForEdit()
    const updateMock = vi.fn().mockReturnThis()
    enqueueUpdate({ update: updateMock })
    enqueueRefetch([])
    const res = await PATCH(
      makeReq({
        decisions: [{ recommendation_id: REC_ID, decision: "accept" }],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }) },
    )
    expect(res.status).toBe(200)
    const arg = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.review_state).toBe("accepted")
    expect(arg.modified_text).toBeUndefined()
  })

  it("modify: writes review_state + modified_text", async () => {
    enqueueAccessForEdit()
    const updateMock = vi.fn().mockReturnThis()
    enqueueUpdate({ update: updateMock })
    enqueueRefetch([])
    const res = await PATCH(
      makeReq({
        decisions: [
          {
            recommendation_id: REC_ID,
            decision: "modify",
            modified_text: "Versuche eine sachlichere Tonalität.",
          },
        ],
      }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }) },
    )
    expect(res.status).toBe(200)
    const arg = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(arg.review_state).toBe("modified")
    expect(arg.modified_text).toBe("Versuche eine sachlichere Tonalität.")
  })
})
