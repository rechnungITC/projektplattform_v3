/**
 * PROJ-12 + PROJ-70-β — PATCH /api/ki/suggestions/[id] tests.
 *
 * Verifies the purpose-aware payload dispatch: risk payloads validate
 * against the risk schema, proposal_from_context payloads validate
 * against the new flat-with-temp_id schema. Other purposes return 422.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const getUserMock = vi.fn()

const suggestionChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const updateChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(),
}
const projectChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const tenantMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}
const projectMembershipChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
}

let nextSuggestionLookup: unknown = null
let nextSuggestionUpdate: unknown = null

const fromMock = vi.fn((table: string) => {
  if (table === "ki_suggestions") {
    return {
      ...suggestionChain,
      ...updateChain,
      maybeSingle: vi.fn(async () => ({
        data: nextSuggestionLookup,
        error: null,
      })),
      single: vi.fn(async () => ({
        data: nextSuggestionUpdate,
        error: null,
      })),
    }
  }
  if (table === "projects") return projectChain
  if (table === "tenant_memberships") return tenantMembershipChain
  if (table === "project_memberships") return projectMembershipChain
  if (table === "tenant_settings") {
    const chain: { select: () => unknown; eq: () => unknown; maybeSingle: () => Promise<{ data: null; error: null }> } = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    }
    return chain
  }
  return suggestionChain
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

import { PATCH } from "./route"

const SID = "44444444-4444-4444-8444-444444444444"
const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "33333333-3333-4333-8333-333333333333"

function makePatch(body: unknown): Request {
  return new Request(`http://localhost/api/ki/suggestions/${SID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function setupAccess() {
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } })
  projectChain.maybeSingle.mockResolvedValue({
    data: { id: PROJECT_ID, tenant_id: TENANT_ID, project_method: "scrum" },
    error: null,
  })
  tenantMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "member" },
    error: null,
  })
  projectMembershipChain.maybeSingle.mockResolvedValue({
    data: { role: "editor" },
    error: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  nextSuggestionLookup = null
  nextSuggestionUpdate = null
})

describe("PATCH /api/ki/suggestions/[id] — purpose-aware payload validation", () => {
  it("returns 401 when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "draft",
      purpose: "risks",
    }
    const res = await PATCH(
      makePatch({
        payload: {
          title: "T",
          probability: 3,
          impact: 3,
          status: "open",
          mitigation: null,
        },
      }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid uuid path-param", async () => {
    setupAccess()
    const res = await PATCH(
      makePatch({ payload: { title: "T", probability: 3, impact: 3 } }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    )
    expect(res.status).toBe(400)
  })

  it("returns 422 on unsupported purpose (e.g. coaching)", async () => {
    setupAccess()
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "draft",
      purpose: "coaching",
    }
    const res = await PATCH(
      makePatch({ payload: { title: "T" } }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(422)
  })

  it("accepts a valid proposal_from_context payload", async () => {
    setupAccess()
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "draft",
      purpose: "proposal_from_context",
    }
    const newPayload = {
      temp_id: "t_1",
      parent_temp_id: null,
      kind: "epic",
      title: "Edited title",
      description: "Edited description.",
      confidence: "high",
    }
    nextSuggestionUpdate = {
      id: SID,
      payload: newPayload,
      original_payload: { temp_id: "t_1", title: "Original" },
      is_modified: true,
      status: "draft",
      updated_at: "2026-06-03T12:00:00Z",
    }
    const res = await PATCH(
      makePatch({ payload: newPayload }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      suggestion: { is_modified: boolean; payload: { title: string } }
    }
    expect(body.suggestion.is_modified).toBe(true)
    expect(body.suggestion.payload.title).toBe("Edited title")
  })

  it("rejects proposal_from_context payload with invalid kind", async () => {
    setupAccess()
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "draft",
      purpose: "proposal_from_context",
    }
    const res = await PATCH(
      makePatch({
        payload: {
          temp_id: "t_1",
          parent_temp_id: null,
          kind: "milestone", // not in the allowed enum
          title: "T",
          description: null,
          confidence: "low",
        },
      }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(400)
  })

  it("rejects proposal_from_context payload with missing title", async () => {
    setupAccess()
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "draft",
      purpose: "proposal_from_context",
    }
    const res = await PATCH(
      makePatch({
        payload: {
          temp_id: "t_1",
          parent_temp_id: null,
          kind: "task",
          description: null,
          confidence: "low",
        },
      }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(400)
  })

  it("rejects proposal_from_context payload with title shorter than 3 chars", async () => {
    setupAccess()
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "draft",
      purpose: "proposal_from_context",
    }
    const res = await PATCH(
      makePatch({
        payload: {
          temp_id: "t_1",
          parent_temp_id: null,
          kind: "task",
          title: "ab",
          description: null,
          confidence: "low",
        },
      }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(400)
  })

  it("returns 409 when suggestion is already accepted/rejected", async () => {
    setupAccess()
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "accepted",
      purpose: "proposal_from_context",
    }
    const res = await PATCH(
      makePatch({
        payload: {
          temp_id: "t_1",
          parent_temp_id: null,
          kind: "task",
          title: "Title",
          description: null,
          confidence: "low",
        },
      }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(409)
  })

  it("accepts a valid risk payload (backwards-compat with PROJ-12)", async () => {
    setupAccess()
    nextSuggestionLookup = {
      id: SID,
      project_id: PROJECT_ID,
      status: "draft",
      purpose: "risks",
    }
    const riskPayload = {
      title: "Datenmigration verzögert",
      description: "Risiko",
      probability: 3,
      impact: 4,
      status: "open",
      mitigation: "Migration in 2 Wellen.",
    }
    nextSuggestionUpdate = {
      id: SID,
      payload: riskPayload,
      original_payload: { ...riskPayload, title: "Original" },
      is_modified: true,
      status: "draft",
      updated_at: "2026-06-03T12:00:00Z",
    }
    const res = await PATCH(
      makePatch({ payload: riskPayload }),
      { params: Promise.resolve({ id: SID }) },
    )
    expect(res.status).toBe(200)
  })
})
