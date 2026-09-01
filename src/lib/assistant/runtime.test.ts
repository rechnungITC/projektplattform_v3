import { describe, expect, it, vi } from "vitest"

import {
  classifyAssistantIntent,
  handleAssistantTurn,
} from "./runtime"

describe("classifyAssistantIntent", () => {
  it.each([
    "Leg mir ein Projekt an",
    "Lege bitte ein neues Projekt an",
    "Erstell mir ein Projekt",
    "Mach ein neues Projekt für mich",
    "Kannst du mir bitte ein Projekt anlegen?",
  ])("recognizes colloquial project creation: %s", (input) => {
    expect(classifyAssistantIntent(input).intent).toBe("project_create_draft")
  })

  it("recognizes project status queries", () => {
    expect(
      classifyAssistantIntent("Wie ist der aktuelle Stand zum Projekt Apollo?")
        .intent,
    ).toBe("project_status_query")
  })

  it("recognizes navigation commands", () => {
    const result = classifyAssistantIntent("Zeige Risiken im Projekt Apollo")
    expect(result.intent).toBe("project_status_query")
    expect(result.area).toBe("risks")
  })

  it("recognizes project draft creation", () => {
    const result = classifyAssistantIntent(
      "Erstelle ein neues Software Projekt zum Thema Kundenportal mit Scrum",
    )
    expect(result.intent).toBe("project_create_draft")
    expect(result.draft?.project_type).toBe("software")
    expect(result.draft?.project_method).toBe("scrum")
  })

  it("does not guess when a sentence combines materially different actions", () => {
    expect(
      classifyAssistantIntent(
        "Leg ein Projekt an und erstelle eine Story Rechnungsimport",
      ).intent,
    ).toBe("needs_clarification")
    expect(
      classifyAssistantIntent(
        "Wie steht Apollo und mach eine Story Rechnungsimport",
      ).intent,
    ).toBe("needs_clarification")
    expect(
      classifyAssistantIntent("Wie steht Apollo und leg ein Projekt an").intent,
    ).toBe("needs_clarification")
  })
})

describe("handleAssistantTurn", () => {
  it("collects missing fields before creating a wizard draft", async () => {
    const supabase = makeSupabase({
      tenant_settings: {
        data: {
          assistant_settings: {
            transcript_retention_mode: "persist_metadata_only",
            retention_days: 30,
            stt_provider: "browser",
            tts_provider: "browser",
            wake_word_enabled: false,
          },
        },
      },
    })

    const result = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Erstelle ein neues Software Projekt zum Thema Kundenportal",
      modality: "text",
    })

    expect(result.recognized_intent).toBe("project_create_draft")
    expect(result.wizard_draft).toBeNull()
    expect(result.dialog_state).toMatchObject({
      pending_intent: "project_create_draft",
      requested_slot: "project_method",
      slots: { name: "Kundenportal", project_type: "software" },
    })
    expect(supabase.from).not.toHaveBeenCalledWith("project_wizard_drafts")
    expect(supabase.from).not.toHaveBeenCalledWith("projects")
  })

  it("continues a project dialog instead of reclassifying a short answer", async () => {
    const supabase = makeSupabase({ tenant_settings: { data: { assistant_settings: {} } } })
    const first = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Leg mir ein Projekt an",
      modality: "text",
    })
    const second = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Apollo",
      modality: "text",
      dialogState: first.dialog_state,
    })

    expect(second.recognized_intent).toBe("project_create_draft")
    expect(second.dialog_state).toMatchObject({
      revision: 1,
      requested_slot: "project_type",
      slots: { name: "Apollo" },
    })
  })

  it("replaces a pending dialog when the user explicitly starts a new command", async () => {
    const supabase = makeSupabase({ tenant_settings: { data: { assistant_settings: {} } } })
    const first = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Leg mir ein Projekt an",
      modality: "text",
    })
    const replaced = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Leg mir ein neues Projekt an",
      modality: "text",
      dialogState: first.dialog_state,
    })

    expect(replaced.dialog_state).toMatchObject({ revision: 0 })
    expect(replaced.tool_calls[0]).toMatchObject({ key: "dialog.replace" })
  })

  it("clears a pending dialog when moving between global and project context", async () => {
    const supabase = makeSupabase({ tenant_settings: { data: { assistant_settings: {} } } })
    const first = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Leg mir ein Projekt an",
      modality: "text",
    })
    const changed = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Apollo",
      modality: "text",
      projectId: "project-1",
      dialogState: first.dialog_state,
    })

    expect(changed.dialog_state).toBeNull()
    expect(changed.tool_calls[0]).toMatchObject({ key: "dialog.context_changed" })
  })

  it("returns a project-specific repair hint for an incomplete project phrase", async () => {
    const supabase = makeSupabase({ tenant_settings: { data: { assistant_settings: {} } } })
    const result = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Irgendwas mit dem Projekt Apollo",
      modality: "text",
    })
    expect(result.user_response).toContain("Projektstatus")
    expect(result.user_response).toContain("Projektentwurf")
  })

  it("blocks navigation when the target module is disabled", async () => {
    const project = {
      id: "project-1",
      tenant_id: "tenant-1",
      name: "Apollo",
      description: null,
      lifecycle_status: "active",
      project_type: "general",
      project_method: "waterfall",
      planned_start_date: null,
      planned_end_date: null,
      is_deleted: false,
    }
    const supabase = makeSupabase({
      tenant_settings: {
        data: {
          assistant_settings: {},
          active_modules: ["assistant"],
        },
      },
      projects: { data: project },
    })

    const result = await handleAssistantTurn({
      supabase: supabase as never,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Gehe zu Risiken",
      modality: "text",
      projectId: "project-1",
    })

    expect(result.result_status).toBe("blocked")
    expect(result.user_response).toContain("deaktiviert")
  })
})

function makeSupabase(fixtures: Record<string, { data: unknown; error?: unknown }>) {
  const from = vi.fn((table: string) => {
    const fixture = fixtures[table] ?? { data: [], error: null }
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: fixture.data,
        error: fixture.error ?? null,
      }),
      single: vi.fn().mockResolvedValue({
        data: fixture.data,
        error: fixture.error ?? null,
      }),
    }
    return chain
  })
  return { from, rpc: vi.fn() }
}
