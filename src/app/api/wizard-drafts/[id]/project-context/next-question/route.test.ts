import { beforeEach, describe, expect, it, vi } from "vitest"

const { getAuthMock, invokeMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  invokeMock: vi.fn(),
}))

vi.mock("@/lib/ai/router", () => ({
  invokeClarifyingQuestionsGeneration: invokeMock,
}))
vi.mock("../../../../_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../_lib/route-helpers")
  >("../../../../_lib/route-helpers")
  return { ...actual, getAuthenticatedUserId: getAuthMock }
})

import { POST } from "./route"

const DRAFT_ID = "11111111-1111-4111-8111-111111111111"
const REQUEST_ID = "22222222-2222-4222-8222-222222222222"
const UPDATED_AT = "2026-09-01T12:00:00.000Z"

function request(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe("POST next project-context question", () => {
  it("validates the draft id", async () => {
    const response = await POST(request({}), {
      params: Promise.resolve({ id: "bad" }),
    })
    expect(response.status).toBe(400)
  })

  it("requires authentication", async () => {
    getAuthMock.mockResolvedValue({ userId: null, supabase: {} })
    const response = await POST(
      request({ request_id: REQUEST_ID, expected_updated_at: UPDATED_AT }),
      { params: Promise.resolve({ id: DRAFT_ID }) },
    )
    expect(response.status).toBe(401)
  })

  it("returns a typed manual fallback when no provider produces a question", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn()
        .mockResolvedValueOnce({
          data: {
          id: DRAFT_ID,
          tenant_id: "tenant",
          updated_at: UPDATED_AT,
          data: {
            name: "Projekt",
            project_type: "software",
            skills: { assignments: [] },
            project_context: {
              summary: "",
              statements: [],
              turns: [],
              skill_coverage: [],
              gaps: [],
              assumptions: [],
              contradictions: [],
              analysis_status: "captured_not_ai_analyzed",
              reason_code: null,
              finished: false,
            },
          },
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { updated_at: "2026-09-01T12:00:01.000Z" }, error: null }),
    }
    getAuthMock.mockResolvedValue({
      userId: "user",
      supabase: { from: vi.fn(() => chain) },
    })
    invokeMock.mockResolvedValue({
      run_id: "run",
      status: "external_blocked",
      questions: [],
      reason_code: "no_provider",
      external_blocked: true,
    })

    const response = await POST(
      request({ request_id: REQUEST_ID, expected_updated_at: UPDATED_AT }),
      { params: Promise.resolve({ id: DRAFT_ID }) },
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ question: null, reason_code: "no_provider" })
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "skill_context_clarification", count: 1 }),
    )
  })
})
