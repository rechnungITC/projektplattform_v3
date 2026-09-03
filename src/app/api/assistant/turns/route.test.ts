import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
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

import { DELETE, GET, POST } from "./route"

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
  mocks.supabase.rpc.mockResolvedValue({ data: 1, error: null })
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
  it("rejects a structured continuation without a session", async () => {
    const res = await POST(request({
      continuation: {
        kind: "cancel",
        expected_revision: 0,
      },
    }))
    expect(res.status).toBe(400)
    expect(mocks.handleAssistantTurn).not.toHaveBeenCalled()
  })

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
      response_text: null,
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
      response_text: null,
    })
  })

  it("reuses an atomically committed turn without writing duplicate audit rows", async () => {
    mocks.handleAssistantTurn.mockResolvedValue({
      recognized_intent: "project_create_draft",
      requires_confirmation: false,
      confirmation_state: "confirmed",
      result_status: "success",
      user_response: "Entwurf vorbereitet",
      project_id: null,
      route_target: null,
      project_choices: [],
      wizard_draft: { id: "66666666-6666-4666-8666-666666666666", name: "Apollo", href: "/wizard" },
      work_item_draft: null,
      tool_calls: [],
      transcript_persistence: "none",
      dialog_state: null,
      session_state_committed: true,
      committed_turn: {
        id: "77777777-7777-4777-8777-777777777777",
        created_at: "2026-08-27T08:00:00.000Z",
      },
    })

    const res = await POST(request({ input_text: "Freigeben", modality: "text" }))
    expect(res.status).toBe(200)
    expect(tableInserts.assistant_turns).toEqual([])
    expect(tableInserts.assistant_action_events).toEqual([])
    await expect(res.json()).resolves.not.toHaveProperty("result.committed_turn")
  })

  it("returns 409 before runtime execution for a stale dialog revision", async () => {
    const sessionId = "33333333-3333-4333-8333-333333333333"
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return chain({ assistant_settings: {} }, table)
      }
      if (table === "assistant_sessions") {
        return chain({
          id: sessionId,
          last_turn_at: "2026-08-21T12:00:00.000Z",
          context: {
            dialog_state: {
              schema_version: 1,
              revision: 3,
              pending_intent: "project_create_draft",
              phase: "collecting",
              expires_at: "2099-08-21T12:30:00.000Z",
              started_project_id: null,
              requested_slot: "name",
              candidate_project_ids: [],
              slots: {
                name: null,
                project_type: null,
                project_method: null,
                description: null,
                skipped: [],
              },
            },
          },
        }, table)
      }
      throw new Error(`unexpected table ${table}`)
    })

    const res = await POST(request({
      session_id: sessionId,
      continuation: {
        kind: "cancel",
        expected_revision: 2,
      },
    }))

    expect(res.status).toBe(409)
    expect(mocks.handleAssistantTurn).not.toHaveBeenCalled()
  })
})

describe("GET /api/assistant/turns", () => {
  it("loads an owner-scoped pending dialog and its visible project choices", async () => {
    const sessionId = "33333333-3333-4333-8333-333333333333"
    const projectId = "66666666-6666-4666-8666-666666666666"
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === "assistant_sessions") {
        return chain({
          id: sessionId,
          last_turn_at: "2026-08-21T12:00:00.000Z",
          context: {
            dialog_state: {
              schema_version: 1,
              revision: 2,
              pending_intent: "work_item_create_draft",
              phase: "choosing_project",
              expires_at: "2099-08-21T12:30:00.000Z",
              started_project_id: null,
              requested_slot: "project",
              candidate_project_ids: [projectId],
              slots: {
                requested_kind: "story",
                title: "Rechnungsimport",
                description: null,
                project_query: "Apollo",
                project_id: null,
              },
            },
          },
        }, table)
      }
      if (table === "projects") {
        return chain([
          { id: projectId, name: "Apollo", lifecycle_status: "active" },
        ], table)
      }
      throw new Error(`unexpected table ${table}`)
    })

    const res = await GET(new Request(
      `http://localhost/api/assistant/turns?session_id=${sessionId}`,
    ))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.dialog_state).toMatchObject({ revision: 2 })
    expect(body.result.project_choices).toEqual([
      { id: projectId, name: "Apollo", lifecycle_status: "active" },
    ])
    expect(mocks.requireModuleActive).toHaveBeenCalledWith(
      mocks.supabase,
      TENANT_ID,
      "assistant",
      { intent: "read" },
    )
  })

  it("does not resume an expired dialog", async () => {
    const sessionId = "33333333-3333-4333-8333-333333333333"
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === "assistant_sessions") {
        return chain({
          id: sessionId,
          context: {
            dialog_state: {
              schema_version: 1,
              revision: 1,
              pending_intent: "project_create_draft",
              phase: "collecting",
              expires_at: "2020-01-01T00:00:00.000Z",
              started_project_id: null,
              requested_slot: "name",
              candidate_project_ids: [],
              slots: {
                name: null,
                project_type: null,
                project_method: null,
                description: null,
                skipped: [],
              },
            },
          },
        }, table)
      }
      throw new Error(`unexpected table ${table}`)
    })

    const res = await GET(new Request(
      `http://localhost/api/assistant/turns?session_id=${sessionId}`,
    ))

    expect(res.status).toBe(200)
    expect(mocks.supabase.rpc).toHaveBeenCalledWith(
      "clear_assistant_dialog_state",
      { p_session_id: sessionId, p_reason: "expired" },
    )
    await expect(res.json()).resolves.toMatchObject({
      result: { dialog_state: null, project_choices: [] },
    })
  })
})

describe("DELETE /api/assistant/turns", () => {
  it("clears all pending dialog state before logout", async () => {
    const res = await DELETE(new Request("http://localhost/api/assistant/turns", {
      method: "DELETE",
    }))
    expect(res.status).toBe(204)
    expect(mocks.supabase.rpc).toHaveBeenCalledWith(
      "clear_assistant_dialog_state",
      { p_session_id: null, p_reason: "logout" },
    )
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
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn((payload: unknown) => {
      tableInserts[table] = [...(tableInserts[table] ?? []), payload]
      return chain(data, table)
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  }
  return builder
}
