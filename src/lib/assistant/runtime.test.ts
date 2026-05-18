import { describe, expect, it, vi } from "vitest"

import {
  classifyAssistantIntent,
  handleAssistantTurn,
} from "./runtime"

describe("classifyAssistantIntent", () => {
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
})

describe("handleAssistantTurn", () => {
  it("creates a wizard draft instead of a final project", async () => {
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
      project_wizard_drafts: {
        data: { id: "draft-1", name: "Kundenportal" },
      },
    })

    const result = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Erstelle ein neues Software Projekt zum Thema Kundenportal",
      modality: "text",
    })

    expect(result.recognized_intent).toBe("project_create_draft")
    expect(result.wizard_draft?.href).toBe(
      "/projects/new/wizard?draftId=draft-1",
    )
    expect(supabase.from).not.toHaveBeenCalledWith("projects")
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
      supabase,
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
  return { from } as never as { from: typeof from }
}
