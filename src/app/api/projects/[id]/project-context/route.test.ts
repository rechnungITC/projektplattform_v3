import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, accessMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  accessMock: vi.fn(),
}))

vi.mock("../../../_lib/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("../../../_lib/route-helpers")>(
    "../../../_lib/route-helpers",
  )
  return {
    ...actual,
    getAuthenticatedUserId: getAuthMock,
    requireProjectAccess: accessMock,
  }
})

import { GET } from "./route"

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const REVISION_ID = "33333333-3333-4333-8333-333333333333"

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.limit.mockResolvedValue(result)
  chain.maybeSingle.mockResolvedValue(result)
  return chain
}

function contextRow() {
  return {
    summary: "Reviewed",
    statements: [],
    turns: [],
    skill_coverage: [],
    gaps: [],
    assumptions: [],
    contradictions: [],
    analysis_status: "captured_not_ai_analyzed",
    reason_code: null,
    finished: true,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  accessMock.mockResolvedValue({ project: { id: PROJECT_ID, tenant_id: "tenant" } })
})

describe("GET project context", () => {
  it("rejects invalid ids before authentication", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "bad" }),
    })
    expect(response.status).toBe(400)
  })

  it("requires authentication", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: {} })
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    expect(response.status).toBe(401)
  })

  it("returns authoritative coverage and the creator transcript", async () => {
    const chains = {
      project_context_documents: query({
        data: {
          id: "doc",
          project_id: PROJECT_ID,
          created_by: USER_ID,
          confidentiality_level: "standard",
          current_revision_id: REVISION_ID,
          created_at: "2026-09-01T00:00:00Z",
        },
        error: null,
      }),
      project_context_revisions: query({
        data: {
          id: REVISION_ID,
          revision_number: 1,
          context: contextRow(),
          created_at: "2026-09-01T00:00:00Z",
        },
        error: null,
      }),
      project_context_skill_coverage: query({
        data: [
          {
            skill_id: "skill",
            skill_version_id: "version",
            skill_name: "PM",
            coverage_state: "unknown",
            evidence_statement_ids: [],
            stale: false,
          },
        ],
        error: null,
      }),
      profiles: query({ data: { display_name: "Test User" }, error: null }),
      project_context_turns: query({
        data: [
          { client_turn_id: "t1", role: "user", content: "Text", status: "complete" },
        ],
        error: null,
      }),
    }
    getAuthMock.mockResolvedValue({
      userId: USER_ID,
      supabase: { from: vi.fn((table: keyof typeof chains) => chains[table]) },
    })

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.document.context.skill_coverage[0].state).toBe("unknown")
    expect(body.document.transcript[0]).toMatchObject({ id: "t1", content: "Text" })
  })

  it("returns null transcript to a viewer who is not the author", async () => {
    const chains = {
      project_context_documents: query({
        data: {
          id: "doc",
          project_id: PROJECT_ID,
          created_by: "44444444-4444-4444-8444-444444444444",
          confidentiality_level: "standard",
          current_revision_id: REVISION_ID,
          created_at: "2026-09-01T00:00:00Z",
        },
        error: null,
      }),
      project_context_revisions: query({
        data: { id: REVISION_ID, revision_number: 1, context: contextRow(), created_at: "x" },
        error: null,
      }),
      project_context_skill_coverage: query({ data: [], error: null }),
      profiles: query({ data: null, error: null }),
      project_memberships: query({ data: { role: "viewer" }, error: null }),
    }
    getAuthMock.mockResolvedValue({
      userId: USER_ID,
      supabase: { from: vi.fn((table: keyof typeof chains) => chains[table]) },
    })
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: PROJECT_ID }),
    })
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.document.transcript).toBeNull()
  })
})
