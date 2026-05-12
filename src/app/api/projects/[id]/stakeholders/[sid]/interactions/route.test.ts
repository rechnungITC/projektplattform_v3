import { beforeEach, describe, expect, it, vi } from "vitest"

// PROJ-34-α — Interaction list + create tests. Uses queued chain dispatch
// because `stakeholder_interactions` and `stakeholder_interaction_participants`
// each get hit multiple times along different code paths.

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

// Per-table queue. Each test enqueues the chain it expects to consume.
const chains: Record<string, Chain[]> = {}
function enqueue(table: string, chain: Chain) {
  ;(chains[table] ??= []).push(chain)
}

const fromMock = vi.fn((table: string) => {
  const next = chains[table]?.shift()
  if (!next) {
    throw new Error(`unexpected/exhausted chain for ${table}`)
  }
  return next
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { GET, POST } from "./route"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const STAKEHOLDER_ID = "44444444-4444-4444-8444-444444444444"
const INTERACTION_ID = "55555555-5555-4555-8555-555555555555"

function makeReq(method: string, body?: unknown): Request {
  return new Request(
    `http://localhost/api/projects/${PROJECT_ID}/stakeholders/${STAKEHOLDER_ID}/interactions`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
  )
}

// Helpers that build the access-check chains (project lookup +
// tenant_memberships + project_memberships).
function enqueueAccess({
  isAdmin = true,
  hasProjectMembership = false,
  projectExists = true,
}: { isAdmin?: boolean; hasProjectMembership?: boolean; projectExists?: boolean } = {}) {
  const projectChain: Chain = {
    select: vi.fn().mockReturnThis() as Chain["select"],
    eq: vi.fn().mockReturnThis() as Chain["eq"],
    maybeSingle: vi.fn().mockResolvedValue({
      data: projectExists ? { id: PROJECT_ID, tenant_id: TENANT_ID } : null,
      error: null,
    }) as Chain["maybeSingle"],
  }
  enqueue("projects", projectChain)
}

function enqueueAccessForManage({
  isAdmin = true,
  hasProjectMembership = false,
  projectExists = true,
}: { isAdmin?: boolean; hasProjectMembership?: boolean; projectExists?: boolean } = {}) {
  enqueueAccess({ isAdmin, hasProjectMembership, projectExists })
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
    maybeSingle: vi.fn().mockResolvedValue({
      data: hasProjectMembership ? { role: "lead" } : null,
      error: null,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(chains)) delete chains[k]
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
})

describe("GET /api/projects/[id]/stakeholders/[sid]/interactions", () => {
  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid uuid", async () => {
    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: "not-a-uuid", sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(400)
  })

  it("returns empty list when stakeholder has no interactions", async () => {
    enqueueAccess()
    enqueue("stakeholder_interaction_participants", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interactions).toEqual([])
  })

  it("loads interactions plus their participants for a stakeholder", async () => {
    enqueueAccess()
    enqueue("stakeholder_interaction_participants", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ interaction_id: INTERACTION_ID }],
        error: null,
      }),
    })
    enqueue("stakeholder_interactions", {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: INTERACTION_ID,
            tenant_id: TENANT_ID,
            project_id: PROJECT_ID,
            channel: "email",
            direction: "outbound",
            interaction_date: "2026-05-10T10:00:00Z",
            summary: "Kickoff",
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
          },
        ],
        error: null,
      }),
    })
    enqueue("stakeholder_interaction_participants", {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [
          {
            interaction_id: INTERACTION_ID,
            stakeholder_id: STAKEHOLDER_ID,
            participant_sentiment: null,
            participant_sentiment_source: null,
            participant_cooperation_signal: null,
            participant_cooperation_signal_source: null,
          },
        ],
        error: null,
      }),
    })

    const res = await GET(makeReq("GET"), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.interactions).toHaveLength(1)
    expect(body.interactions[0].participants).toHaveLength(1)
  })
})

describe("POST /api/projects/[id]/stakeholders/[sid]/interactions", () => {
  const validBody = {
    channel: "email",
    direction: "outbound",
    interaction_date: "2026-05-10T10:00:00Z",
    summary: "test",
  }

  it("returns 401 when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq("POST", validBody), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 when not project-member and not tenant-admin", async () => {
    enqueueAccessForManage({ isAdmin: false, hasProjectMembership: false })
    const res = await POST(makeReq("POST", validBody), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid channel", async () => {
    enqueueAccessForManage()
    const res = await POST(
      makeReq("POST", { ...validBody, channel: "ESP" }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }) },
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 for summary over 500 chars", async () => {
    enqueueAccessForManage()
    const res = await POST(
      makeReq("POST", { ...validBody, summary: "x".repeat(501) }),
      { params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }) },
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when stakeholder belongs to another project", async () => {
    enqueueAccessForManage()
    enqueue("stakeholders", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: STAKEHOLDER_ID,
          project_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          tenant_id: TENANT_ID,
        },
        error: null,
      }),
    })

    const res = await POST(makeReq("POST", validBody), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 201 and inserts interaction + URL-stakeholder as participant", async () => {
    enqueueAccessForManage()
    enqueue("stakeholders", {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: STAKEHOLDER_ID, project_id: PROJECT_ID, tenant_id: TENANT_ID },
        error: null,
      }),
    })
    enqueue("stakeholder_interactions", {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: INTERACTION_ID,
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          channel: "email",
          direction: "outbound",
          interaction_date: "2026-05-10T10:00:00Z",
          summary: "test",
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
        },
        error: null,
      }),
    })
    enqueue("stakeholder_interaction_participants", {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: [
          {
            interaction_id: INTERACTION_ID,
            stakeholder_id: STAKEHOLDER_ID,
            participant_sentiment: null,
            participant_sentiment_source: null,
            participant_cooperation_signal: null,
            participant_cooperation_signal_source: null,
          },
        ],
        error: null,
      }),
    })

    const res = await POST(makeReq("POST", validBody), {
      params: Promise.resolve({ id: PROJECT_ID, sid: STAKEHOLDER_ID }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.interaction.id).toBe(INTERACTION_ID)
    expect(body.interaction.participants).toHaveLength(1)
    expect(body.interaction.participants[0].stakeholder_id).toBe(STAKEHOLDER_ID)
  })
})
