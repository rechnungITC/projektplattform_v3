import type { SupabaseClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { classifyAssistantIntent, handleAssistantTurn } from "./runtime"

// PROJ-144 — Schritt 1 im Zusammenspiel: Projektauflösung, Vorab-Rechteprüfung,
// Methoden-Abbildung und Transkript-Regel. Die reine Befehlszerlegung ist in
// work-item-command.test.ts abgedeckt; hier geht es um das Verhalten der Runtime.

const SCRUM_PROJECT = {
  id: "project-scrum",
  tenant_id: "tenant-1",
  name: "ERP-Rollout",
  description: null,
  lifecycle_status: "active",
  project_type: "erp",
  project_method: "scrum",
  planned_start_date: null,
  planned_end_date: null,
  is_deleted: false,
}

const WATERFALL_PROJECT = { ...SCRUM_PROJECT, id: "project-wf", name: "Bau Nord", project_method: "waterfall" }

interface Fixtures {
  project?: unknown
  tenantRole?: string | null
  projectRole?: string | null
  retentionMode?: string
  draftRow?: unknown
  draftError?: unknown
  rpcRow?: unknown
  rpcError?: unknown
}

let inserted: Record<string, unknown>[] = []

beforeEach(() => {
  inserted = []
})

describe("classifyAssistantIntent — neuer Intent", () => {
  it("erkennt die Work-Item-Anlage", () => {
    const res = classifyAssistantIntent("Neue Story: Rechnungsimport testen")
    expect(res.intent).toBe("work_item_create_draft")
    expect(res.workItem?.title).toBe("Rechnungsimport testen")
  })

  it("lässt die bestehenden Intents unberührt (AC-144.30)", () => {
    expect(classifyAssistantIntent("Wie ist der Stand zum Projekt Apollo?").intent).toBe(
      "project_status_query",
    )
    expect(
      classifyAssistantIntent("Erstelle ein neues Software Projekt zum Thema Portal")
        .intent,
    ).toBe("project_create_draft")
    expect(classifyAssistantIntent("Gehe zu Risiken").intent).toBe("navigate_to_area")
  })
})

describe("handleAssistantTurn — Sprach-Entwurf", () => {
  it("legt einen Entwurf an, aber kein Work-Item (AC-144.15)", async () => {
    const supabase = makeSupabase({ project: SCRUM_PROJECT, projectRole: "editor" })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story: Rechnungsimport testen",
      modality: "voice",
      projectId: "project-scrum",
    })

    expect(res.recognized_intent).toBe("work_item_create_draft")
    expect(res.result_status).toBe("success")
    expect(res.requires_confirmation).toBe(true)
    expect(res.confirmation_state).toBe("required")
    expect(res.work_item_draft?.target_kind).toBe("story")
    expect(res.work_item_draft?.kind_was_mapped).toBe(false)
    // Entscheidend: die Work-Item-Tabelle wird in Schritt 1 nicht berührt.
    expect(supabase.from).not.toHaveBeenCalledWith("work_items")
    expect(inserted[0]).toMatchObject({
      project_id: "project-scrum",
      target_kind: "story",
      requested_kind: "story",
      title: "Rechnungsimport testen",
      source_modality: "voice",
    })
  })

  it("bildet in Wasserfall auf ein Arbeitspaket ab und sagt das (AC-144.8)", async () => {
    const supabase = makeSupabase({
      project: WATERFALL_PROJECT,
      projectRole: "lead",
      draftRow: {
        id: "draft-2",
        title: "Schnittstelle abnehmen",
        description: null,
        target_kind: "work_package",
        requested_kind: "story",
      },
    })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story: Schnittstelle abnehmen",
      modality: "voice",
      projectId: "project-wf",
    })

    expect(res.work_item_draft?.target_kind).toBe("work_package")
    expect(res.work_item_draft?.kind_was_mapped).toBe(true)
    expect(res.user_response).toContain("Wasserfall")
    expect(res.user_response).toContain("Arbeitspaket")
  })

  it("sagt bei fehlendem Schreibrecht ab, ohne einen Entwurf anzulegen (AC-144.22)", async () => {
    const supabase = makeSupabase({
      project: SCRUM_PROJECT,
      tenantRole: "member",
      projectRole: "viewer",
    })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story: Rechnungsimport testen",
      modality: "voice",
      projectId: "project-scrum",
    })

    expect(res.result_status).toBe("blocked")
    expect(res.requires_confirmation).toBe(false)
    expect(res.work_item_draft).toBeNull()
    expect(inserted).toHaveLength(0)
    expect(supabase.from).not.toHaveBeenCalledWith("assistant_work_item_drafts")
  })

  it("fragt nach dem Titel, wenn nur die Art gesagt wurde (AC-144.3)", async () => {
    const supabase = makeSupabase({ project: SCRUM_PROJECT, projectRole: "editor" })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story",
      modality: "voice",
      projectId: "project-scrum",
    })

    expect(res.result_status).toBe("needs_clarification")
    expect(res.requires_confirmation).toBe(false)
    expect(inserted).toHaveLength(0)
  })

  it("fragt nach dem Projekt, wenn es keinen Kontext gibt (AC-144.13)", async () => {
    const supabase = makeSupabase({ project: null, projectRole: "editor" })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story: Rechnungsimport testen",
      modality: "voice",
    })

    expect(res.result_status).toBe("needs_clarification")
    expect(res.user_response).toContain("Projekt")
    expect(inserted).toHaveLength(0)
  })

  it("verweigert die Unteraufgabe statt sie umzudeuten (AC-144.10)", async () => {
    const supabase = makeSupabase({ project: SCRUM_PROJECT, projectRole: "editor" })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Unteraufgabe Testdaten anlegen",
      modality: "voice",
      projectId: "project-scrum",
    })

    expect(res.result_status).toBe("needs_clarification")
    expect(res.user_response).toContain("übergeordnetes Element")
    expect(inserted).toHaveLength(0)
  })

  it("speichert kein Rohtranskript, wenn der Mandant das verbietet (AC-144.26)", async () => {
    const supabase = makeSupabase({
      project: SCRUM_PROJECT,
      projectRole: "editor",
      retentionMode: "no_persist",
    })

    await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story: Rückruf an max@example.com",
      modality: "voice",
      projectId: "project-scrum",
    })

    expect(inserted[0]?.source_transcript).toBeNull()
    // Der Titel bleibt erhalten — er ist gewollter Geschäftsinhalt.
    expect(inserted[0]?.title).toBe("Rückruf an max@example.com")
  })

  it("speichert das Rohtranskript bereinigt, wenn der Mandant das erlaubt", async () => {
    const supabase = makeSupabase({
      project: SCRUM_PROJECT,
      projectRole: "editor",
      retentionMode: "persist_redacted_transcript",
    })

    await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story: Rückruf an max@example.com",
      modality: "voice",
      projectId: "project-scrum",
    })

    expect(inserted[0]?.source_transcript).toBe(
      "Neue Story: Rückruf an [redacted-email]",
    )
  })

  it("meldet einen Fehlschlag beim Speichern des Entwurfs", async () => {
    const supabase = makeSupabase({
      project: SCRUM_PROJECT,
      projectRole: "editor",
      draftError: { message: "insert exploded" },
    })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "Neue Story: Rechnungsimport testen",
      modality: "voice",
      projectId: "project-scrum",
    })

    expect(res.result_status).toBe("failed")
    expect(res.requires_confirmation).toBe(false)
  })

  it("committet eine fortgesetzte Work-Item-Auswahl atomar über die Session-Revision", async () => {
    const rpcRow = {
      id: "draft-atomic",
      title: "Rechnungsimport testen",
      description: null,
      target_kind: "story",
      requested_kind: "story",
      turn_id: "turn-atomic",
      turn_created_at: "2026-08-27T08:00:00.000Z",
    }
    const supabase = makeSupabase({
      project: SCRUM_PROJECT,
      projectRole: "editor",
      rpcRow,
    })

    const res = await handleAssistantTurn({
      supabase,
      tenantId: "tenant-1",
      userId: "user-1",
      inputText: "",
      modality: "text",
      sessionId: "session-1",
      continuation: {
        kind: "project_choice",
        project_id: "project-scrum",
        expected_revision: 2,
      },
      dialogState: {
        schema_version: 1,
        revision: 2,
        pending_intent: "work_item_create_draft",
        phase: "choosing_project",
        expires_at: "2099-08-27T08:30:00.000Z",
        started_project_id: null,
        requested_slot: "project",
        candidate_project_ids: ["project-scrum"],
        slots: {
          requested_kind: "story",
          title: "Rechnungsimport testen",
          description: null,
          project_query: "ERP-Rollout",
          project_id: null,
        },
      },
    })

    expect(res.session_state_committed).toBe(true)
    expect(res.committed_turn).toEqual({
      id: "turn-atomic",
      created_at: "2026-08-27T08:00:00.000Z",
    })
    expect(supabase.rpc).toHaveBeenCalledWith(
      "complete_assistant_work_item_dialog",
      expect.objectContaining({
        p_session_id: "session-1",
        p_expected_revision: 2,
        p_project_id: "project-scrum",
      }),
    )
    expect(inserted).toHaveLength(0)
  })
})

function makeSupabase(fixtures: Fixtures) {
  const from = vi.fn((table: string) => {
    const api: Record<string, unknown> = {
      select: vi.fn(() => api),
      eq: vi.fn(() => api),
      ilike: vi.fn(() => api),
      order: vi.fn(() => api),
      limit: vi.fn(() => api),
      insert: vi.fn((payload: Record<string, unknown>) => {
        inserted.push(payload)
        return api
      }),
      maybeSingle: vi.fn(async () => resolve(table)),
      single: vi.fn(async () => resolve(table)),
    }
    return api
  })

  function resolve(table: string): { data: unknown; error: unknown } {
    switch (table) {
      case "tenant_settings":
        return {
          data: {
            assistant_settings: {
              transcript_retention_mode:
                fixtures.retentionMode ?? "persist_metadata_only",
            },
            active_modules: ["assistant"],
          },
          error: null,
        }
      case "projects":
        return { data: fixtures.project ?? null, error: null }
      case "tenant_memberships":
        return { data: { role: fixtures.tenantRole ?? "member" }, error: null }
      case "project_memberships":
        return { data: { role: fixtures.projectRole ?? null }, error: null }
      case "assistant_work_item_drafts":
        if (fixtures.draftError) return { data: null, error: fixtures.draftError }
        return {
          data:
            fixtures.draftRow ??
            {
              id: "draft-1",
              title: "Rechnungsimport testen",
              description: null,
              target_kind: "story",
              requested_kind: "story",
            },
          error: null,
        }
      default:
        return { data: null, error: null }
    }
  }

  // Schnittmenge statt `never`: der Mock muss dort einsetzbar sein, wo ein
  // echter `SupabaseClient` erwartet wird, UND `from` muss für die
  // `toHaveBeenCalledWith`-Zusicherungen weiter als Mock erkennbar bleiben.
  // Ein reiner `as never`-Cast erfüllt nur das Zweite und ließ tsc auf jeder
  // Aufrufstelle auflaufen.
  const rpc = vi.fn(async () => ({
    data: fixtures.rpcRow ?? null,
    error: fixtures.rpcError ?? null,
  }))
  return { from, rpc } as unknown as SupabaseClient & {
    from: typeof from
    rpc: typeof rpc
  }
}
