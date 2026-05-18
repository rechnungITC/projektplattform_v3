import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  supabase: {
    from: vi.fn(),
  },
  getAuthenticatedUserId: vi.fn(),
  resolveActiveTenantId: vi.fn(),
  requireTenantMember: vi.fn(),
  requireModuleActive: vi.fn(),
  handleAssistantTurn: vi.fn(),
}))

vi.mock("@/app/api/_lib/route-helpers", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/api/_lib/route-helpers")
  >("@/app/api/_lib/route-helpers")
  return {
    ...actual,
    getAuthenticatedUserId: mocks.getAuthenticatedUserId,
    requireTenantMember: mocks.requireTenantMember,
  }
})

vi.mock("@/app/api/_lib/active-tenant", () => ({
  resolveActiveTenantId: mocks.resolveActiveTenantId,
}))

vi.mock("@/lib/tenant-settings/server", () => ({
  requireModuleActive: mocks.requireModuleActive,
}))

vi.mock("@/lib/assistant/runtime", () => ({
  handleAssistantTurn: mocks.handleAssistantTurn,
}))

import { POST } from "./route"

const USER_ID = "22222222-2222-4222-8222-222222222222"
const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const tableInserts: Record<string, unknown[]> = {}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(tableInserts)) {
    tableInserts[key] = []
  }
  mocks.getAuthenticatedUserId.mockResolvedValue({
    userId: USER_ID,
    supabase: mocks.supabase,
  })
  mocks.resolveActiveTenantId.mockResolvedValue(TENANT_ID)
  mocks.requireTenantMember.mockResolvedValue(null)
  mocks.requireModuleActive.mockResolvedValue(null)
  mocks.handleAssistantTurn.mockResolvedValue({
    recognized_intent: "project_status_query",
    requires_confirmation: false,
    confirmation_state: "not_required",
    result_status: "success",
    user_response: "Statusantwort",
    project_id: null,
    route_target: null,
    project_choices: [],
    wizard_draft: null,
    tool_calls: [{ key: "projects.read", label: "Projekt lesen", status: "executed" }],
    transcript_persistence: "metadata",
  })
  mocks.supabase.from.mockImplementation((table: string) => {
    if (table === "tenant_settings") {
      return chain(
        {
          assistant_settings: {
            transcript_retention_mode: "persist_metadata_only",
          },
        },
        table,
      )
    }
    if (table === "assistant_sessions") {
      return chain({ id: "33333333-3333-4333-8333-333333333333" }, table)
    }
    if (table === "assistant_turns") {
      return chain(
        {
          id: "44444444-4444-4444-8444-444444444444",
          created_at: "2026-05-18T18:00:00Z",
        },
        table,
      )
    }
    if (table === "assistant_action_events") {
      return chain({ id: "55555555-5555-4555-8555-555555555555" }, table)
    }
    throw new Error(`unexpected table ${table}`)
  })
})

describe("POST /api/assistant/turns", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getAuthenticatedUserId.mockResolvedValue({
      userId: null,
      supabase: mocks.supabase,
    })
    const res = await POST(request({ input_text: "Status?", modality: "text" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when assistant module is disabled", async () => {
    mocks.requireModuleActive.mockResolvedValue(
      Response.json({ error: { code: "module_disabled", message: "off" } }, { status: 403 }),
    )
    const res = await POST(request({ input_text: "Status?", modality: "text" }))
    expect(res.status).toBe(403)
  })

  it("persists session and turn metadata for a valid request", async () => {
    const res = await POST(request({ input_text: "Wie ist der Status?", modality: "text" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.recognized_intent).toBe("project_status_query")
    expect(mocks.handleAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        inputText: "Wie ist der Status?",
      }),
    )
    expect(tableInserts.assistant_turns?.[0]).toMatchObject({
      input_text: null,
      input_redacted: false,
    })
  })

  it("stores only redacted transcript text when policy allows redacted transcripts", async () => {
    mocks.handleAssistantTurn.mockResolvedValue({
      recognized_intent: "project_status_query",
      requires_confirmation: false,
      confirmation_state: "not_required",
      result_status: "success",
      user_response: "Statusantwort",
      project_id: null,
      route_target: null,
      project_choices: [],
      wizard_draft: null,
      tool_calls: [],
      transcript_persistence: "redacted",
    })

    const res = await POST(
      request({
        input_text: "Status bitte an max@example.com",
        modality: "text",
      }),
    )

    expect(res.status).toBe(200)
    expect(tableInserts.assistant_turns?.[0]).toMatchObject({
      input_text: "Status bitte an [redacted-email]",
      input_redacted: true,
    })
  })
})

function request(body: unknown): Request {
  return new Request("http://localhost/api/assistant/turns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function chain(data: unknown, table: string) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      tableInserts[table] = [...(tableInserts[table] ?? []), payload]
      return chain(data, table)
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
}
