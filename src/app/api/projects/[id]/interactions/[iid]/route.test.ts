import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-α — GET / PATCH / DELETE single-interaction tests.

const getUserMock = vi.fn()

interface Chain {
  select?: ReturnType<typeof vi.fn>
  insert?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
  delete?: ReturnType<typeof vi.fn>
  eq?: ReturnType<typeof vi.fn>
  in?: ReturnType<typeof vi.fn>
  is?: ReturnType<typeof vi.fn>
  order?: ReturnType<typeof vi.fn>
  limit?: ReturnType<typeof vi.fn>
  maybeSingle?: ReturnType<typeof vi.fn>
  single?: ReturnType<typeof vi.fn>
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

import { DELETE, GET, PATCH } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const INTERACTION_ID = "55555555-5555-4555-8555-555555555555"

function makeReq(method: string, body?: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/interactions/${INTERACTION_ID}`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
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

function enqueueAccessForEdit({ isAdmin = true } = {}) {
  enqueueAccessForView()
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

function enqueueInteractionLookup(data: Record<string, unknown> | null) {
  enqueue("stakeholder_interactions", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  })
}

function enqueueParticipantsList(rows: Array<Record<string, unknown>>) {
  enqueue("stakeholder_interaction_participants", {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  })
}

function liveInteractionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTERACTION_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    channel: "email",
    direction: "outbound",
    interaction_date: "2026-05-10T10:00:00Z",
    summary: "Original",
    awaiting_response: false,
    response_due_date: null,
    response_received_date: null,
    replies_to_interaction_id: null,
    created_by: USER_ID,
    source: "manual",
    source_context_id: null,
    created_at: "2026-05-10T10:00:00Z",
    updated_at: "2026-05-10T10:00:00Z",
    deleted_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("GET /api/projects/[id]/interactions/[iid]", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 404 when interaction does not exist", async () => {
    enqueueAccessForView()
    enqueueInteractionLookup(null)
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 404 for soft-deleted interactions", async () => {
    enqueueAccessForView()
    enqueueInteractionLookup(
      liveInteractionRow({ deleted_at: "2026-05-11T10:00:00Z" }),
    )
    enqueueParticipantsList([])
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 200 with participants for a live interaction", async () => {
    enqueueAccessForView()
    enqueueInteractionLookup(liveInteractionRow())
    enqueueParticipantsList([
      {
        interaction_id: INTERACTION_ID,
        stakeholder_id: "44444444-4444-4444-8444-444444444444",
        participant_sentiment: null,
        participant_sentiment_source: null,
        participant_cooperation_signal: null,
        participant_cooperation_signal_source: null,
      },
    ])
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interaction.id).toBe(INTERACTION_ID)
    expect(body.interaction.participants).toHaveLength(1)
  })
})

describe("PATCH /api/projects/[id]/interactions/[iid]", () => {
  it("returns 403 for non-admin without project role", async () => {
    enqueueAccessForEdit({ isAdmin: false })
    const res = await PATCH(makeReq("PATCH", { summary: "Edit" }), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 400 when no fields are provided", async () => {
    enqueueAccessForEdit()
    const res = await PATCH(makeReq("PATCH", {}), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 for over-long summary", async () => {
    enqueueAccessForEdit()
    const res = await PATCH(makeReq("PATCH", { summary: "x".repeat(501) }), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("updates summary and returns the refreshed row", async () => {
    enqueueAccessForEdit()
    // PATCH itself
    enqueue("stakeholder_interactions", {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: INTERACTION_ID },
        error: null,
      }),
    })
    // re-load step
    enqueueInteractionLookup(liveInteractionRow({ summary: "Updated" }))
    enqueueParticipantsList([])

    const res = await PATCH(makeReq("PATCH", { summary: "Updated" }), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interaction.summary).toBe("Updated")
  })

  it("returns 404 when interaction is missing or soft-deleted", async () => {
    enqueueAccessForEdit()
    enqueue("stakeholder_interactions", {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    const res = await PATCH(makeReq("PATCH", { summary: "Updated" }), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/projects/[id]/interactions/[iid]", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeReq("DELETE"), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("soft-deletes and returns 204", async () => {
    enqueueAccessForEdit()
    enqueue("stakeholder_interactions", {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: INTERACTION_ID },
        error: null,
      }),
    })
    const res = await DELETE(makeReq("DELETE"), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(204)
  })

  it("returns 404 when interaction is missing or already deleted", async () => {
    enqueueAccessForEdit()
    enqueue("stakeholder_interactions", {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })
    const res = await DELETE(makeReq("DELETE"), {
      params: Promise.resolve({ id: PROJECT_ID, iid: INTERACTION_ID }),
    })
    expect(res.status).toBe(404)
  })
})
