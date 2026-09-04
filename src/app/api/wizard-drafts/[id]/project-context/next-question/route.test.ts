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

  // AC-Y5a.21 — der Klassifizierer sieht den KOMPLETTEN ausgehenden Prompt.
  //
  // Die Slice packt Rahmen, Kickoff, Verlauf UND die unveränderlichen
  // Skill-Anweisungen in EINEN String und übergibt ihn als `content_excerpt` —
  // genau das Feld, das klassifiziert wird. Verschiebt jemand die
  // Skill-Anweisungen in ein eigenes Prompt-Feld, wird der Klassifizierer für
  // sie blind, und Class-3-Inhalte gingen am Gate VORBEI statt durch es
  // hindurch. Das ist kein erfundenes Risiko: PROJ-Y-151e/151f war exakt dieser
  // Fehler im Projekt-Chat und im Quintessenz-Zweck.
  //
  // Das Tech Design dieser Slice listet diesen Nachweis als Pflicht; er fehlte.
  it("hands the classifier the whole outbound prompt, skill instructions included", async () => {
    const SKILL_ID = "33333333-3333-4333-8333-333333333333"
    const VERSION_ID = "44444444-4444-4444-8444-444444444444"
    const SKILL_MARKDOWN = "Frage nach dem Ansprechpartner, z. B. per E-Mail."

    const draftChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            id: DRAFT_ID,
            tenant_id: "tenant",
            updated_at: UPDATED_AT,
            data: {
              name: "ERP-Ablösung",
              description: "Altsystem ersetzen",
              project_type: "erp",
              project_method: "waterfall",
              skills: {
                assignments: [
                  { skill_id: SKILL_ID, assignment_source: "manual_pm" },
                ],
              },
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
        .mockResolvedValueOnce({
          data: { updated_at: "2026-09-01T12:00:01.000Z" },
          error: null,
        }),
    }

    /** Resolves like a PostgREST builder once awaited. */
    function listChain(rows: unknown[]) {
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "eq", "in", "limit"]) {
        chain[method] = vi.fn(() => chain)
      }
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows, error: null })
      return chain
    }

    // Dispatch by TABLE, never by call order: an order-based mock silently
    // hands the wrong rows to the wrong query as soon as anyone reorders them.
    getAuthMock.mockResolvedValue({
      userId: "user",
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "skills") {
            return listChain([
              { id: SKILL_ID, name: "Stakeholder-Klärung", current_version_id: VERSION_ID },
            ])
          }
          if (table === "skill_versions") {
            return listChain([
              {
                id: VERSION_ID,
                skill_id: SKILL_ID,
                version_number: 3,
                markdown_content: SKILL_MARKDOWN,
              },
            ])
          }
          return draftChain
        }),
      },
    })
    invokeMock.mockResolvedValue({
      run_id: "run",
      status: "external_blocked",
      questions: [],
      reason_code: "no_provider",
      external_blocked: true,
    })

    await POST(
      request({ request_id: REQUEST_ID, expected_updated_at: UPDATED_AT }),
      { params: Promise.resolve({ id: DRAFT_ID }) },
    )

    expect(invokeMock).toHaveBeenCalledTimes(1)
    const excerpt = invokeMock.mock.calls[0][0].context.context_source
      .content_excerpt as string

    // Alles, was rausgeht, muss auch im klassifizierten Strang stehen.
    expect(excerpt).toContain(SKILL_MARKDOWN) // die eigentliche Zusicherung
    expect(excerpt).toContain("ERP-Ablösung") // Rahmen
    expect(excerpt).toContain("Altsystem ersetzen") // Vorhaben
  })
})
