import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import { handleAssistantTurn } from "@/lib/assistant/runtime"
import {
  assistantContinuationSchema,
  assistantDialogCompletionSchema,
  isDialogExpired,
  parseAssistantDialogState,
} from "@/lib/assistant/dialog-state"
import { normalizeAssistantSettings } from "@/lib/assistant/settings"
import { transcriptForPersistence } from "@/lib/assistant/transcript"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const turnSchema = z.object({
  session_id: z.string().uuid().optional().nullable(),
  input_text: z.string().trim().max(5000).default(""),
  modality: z.enum(["text", "voice"]).default("text"),
  project_id: z.string().uuid().optional().nullable(),
  client_context_path: z.string().max(500).optional().nullable(),
  dialog_revision: z.number().int().nonnegative().optional().nullable(),
  continuation: assistantContinuationSchema.optional().nullable(),
}).superRefine((value, ctx) => {
  if (!value.input_text && !value.continuation) {
    ctx.addIssue({ code: "custom", path: ["input_text"], message: "Text or continuation is required." })
  }
  if (value.continuation && !value.session_id) {
    ctx.addIssue({ code: "custom", path: ["session_id"], message: "A continuation requires a session." })
  }
})

const resumeSchema = z.object({
  session_id: z.string().uuid(),
})

export async function GET(request: Request) {
  const parsed = resumeSchema.safeParse({
    session_id: new URL(request.url).searchParams.get("session_id"),
  })
  if (!parsed.success) {
    return apiError("validation_error", "A valid session_id is required.", 400, "session_id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("no_active_tenant", "No active tenant.", 403)

  const memberDenied = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenied) return memberDenied

  const moduleDenied = await requireModuleActive(supabase, tenantId, "assistant", {
    intent: "read",
  })
  if (moduleDenied) return moduleDenied

  const loaded = await loadSession({
    supabase,
    tenantId,
    userId,
    sessionId: parsed.data.session_id,
  })
  if ("error" in loaded) return loaded.error

  const dialogState = parseAssistantDialogState(loaded.context.dialog_state)
  if (dialogState && isDialogExpired(dialogState)) {
    const { error } = await supabase.rpc("clear_assistant_dialog_state", {
      p_session_id: loaded.id,
      p_reason: "expired",
    })
    if (error) {
      return apiError(
        "dialog_cleanup_failed",
        "Der abgelaufene Dialog konnte nicht bereinigt werden. Bitte versuche es erneut.",
        500,
      )
    }
  }
  if (!dialogState || isDialogExpired(dialogState)) {
    return NextResponse.json({
      session: { id: loaded.id },
      result: { dialog_state: null, project_choices: [] },
    })
  }

  let projectChoices: Array<{
    id: string
    name: string
    lifecycle_status: string
  }> = []
  if (dialogState.candidate_project_ids.length > 0) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, lifecycle_status")
      .in("id", dialogState.candidate_project_ids)
      .eq("tenant_id", tenantId)
      .eq("is_deleted", false)
    const visible = (data ?? []) as typeof projectChoices
    const byId = new Map(visible.map((project) => [project.id, project]))
    projectChoices = dialogState.candidate_project_ids.flatMap((id) => {
      const project = byId.get(id)
      return project ? [project] : []
    })
  }

  return NextResponse.json({
    session: { id: loaded.id },
    result: {
      dialog_state: dialogState,
      project_choices: projectChoices,
    },
  })
}

export async function DELETE(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id")
  if (sessionId && !z.string().uuid().safeParse(sessionId).success) {
    return apiError("validation_error", "A valid session_id is required.", 400, "session_id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { error } = await supabase.rpc("clear_assistant_dialog_state", {
    p_session_id: sessionId,
    p_reason: sessionId ? "context_changed" : "logout",
  })
  if (error) {
    return apiError(
      "dialog_cleanup_failed",
      "Der offene Assistant-Auftrag konnte nicht bereinigt werden.",
      500,
    )
  }
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = turnSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return apiError("no_active_tenant", "No active tenant.", 403)
  }

  const memberDenied = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenied) return memberDenied

  const moduleDenied = await requireModuleActive(supabase, tenantId, "assistant", {
    intent: "write",
  })
  if (moduleDenied) return moduleDenied

  const settingsRes = await supabase
    .from("tenant_settings")
    .select("assistant_settings")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  const assistantSettings = normalizeAssistantSettings(
    (settingsRes.data as { assistant_settings?: unknown } | null)
      ?.assistant_settings,
  )

  let loadedSession: {
    id: string
    context: Record<string, unknown>
    last_turn_at: string | null
  } | null = null
  if (parsed.data.session_id) {
    const loaded = await loadSession({
        supabase,
        tenantId,
        userId,
        sessionId: parsed.data.session_id,
      })
    if ("error" in loaded) return loaded.error
    loadedSession = loaded
  }

  const dialogState = parseAssistantDialogState(
    loadedSession?.context?.dialog_state,
  )
  const completionParsed = assistantDialogCompletionSchema.safeParse(
    loadedSession?.context?.dialog_completion,
  )
  const completedProjectDialog = completionParsed.success
    ? completionParsed.data
    : null

  if (
    parsed.data.continuation &&
    parsed.data.continuation.expected_revision !== dialogState?.revision &&
    !(
      parsed.data.continuation.kind === "approve_project" &&
      completedProjectDialog?.completion_key === parsed.data.continuation.completion_key &&
      completedProjectDialog.revision === parsed.data.continuation.expected_revision
    )
  ) {
    return apiError(
      "assistant_dialog_conflict",
      "Der Dialog wurde bereits geändert. Bitte lade den aktuellen Stand neu.",
      409,
    )
  }
  if (
    !parsed.data.continuation &&
    dialogState &&
    parsed.data.dialog_revision !== dialogState.revision
  ) {
    return apiError(
      "assistant_dialog_conflict",
      "Der Dialog wurde bereits geändert. Bitte lade den aktuellen Stand neu.",
      409,
    )
  }

  const runtime = await handleAssistantTurn({
    supabase,
    tenantId,
    userId,
    inputText: parsed.data.input_text,
    modality: parsed.data.modality,
    projectId: parsed.data.project_id ?? null,
    clientContextPath: parsed.data.client_context_path ?? null,
    sessionId: loadedSession?.id ?? null,
    dialogState,
    continuation: parsed.data.continuation ?? null,
    completedProjectDialog,
  })

  const session = runtime.session_state_committed && loadedSession
    ? { id: loadedSession.id as string }
    : await upsertSession({
        supabase,
        tenantId,
        userId,
        sessionId: loadedSession?.id ?? null,
        expectedLastTurnAt: loadedSession?.last_turn_at ?? null,
        projectId: runtime.project_id ?? parsed.data.project_id ?? null,
        lastIntent: runtime.recognized_intent,
        clientContextPath: parsed.data.client_context_path ?? null,
        dialogState: runtime.dialog_state,
      })
  if ("error" in session) return session.error

  const persistedInput = transcriptForPersistence(
    parsed.data.input_text,
    runtime.transcript_persistence,
  )

  let turn = runtime.committed_turn
  if (!turn) {
    const { data, error: turnError } = await supabase
      .from("assistant_turns")
      .insert({
        session_id: session.id,
        tenant_id: tenantId,
        user_id: userId,
        project_id: runtime.project_id ?? null,
        modality: parsed.data.modality,
        input_text: persistedInput,
        input_redacted: runtime.transcript_persistence === "redacted",
        recognized_intent: runtime.recognized_intent,
        confirmation_state: runtime.confirmation_state,
        result_status: runtime.result_status,
        tool_calls: runtime.tool_calls,
        // Assistant responses may repeat temporary business slots (project
        // names/descriptions). Metadata audit is sufficient; never persist the
        // rendered response as transcript content.
        response_text: null,
        route_target: runtime.route_target,
        wizard_draft_id: runtime.wizard_draft?.id ?? null,
      })
      .select("id, created_at")
      .single()

    if (turnError || !data) {
      return apiError(
        "turn_persist_failed",
        "Der Assistant-Turn konnte nicht gespeichert werden.",
        500,
      )
    }
    turn = data as { id: string; created_at: string }

    const { error: actionError } = await supabase
      .from("assistant_action_events")
      .insert({
        tenant_id: tenantId,
        session_id: session.id,
        turn_id: turn.id,
        user_id: userId,
        project_id: runtime.project_id ?? null,
        recognized_intent: runtime.recognized_intent,
        action_key: runtime.tool_calls[0]?.key ?? runtime.recognized_intent,
        confirmation_state: runtime.confirmation_state,
        executed_tools: runtime.tool_calls,
        result_status: runtime.result_status,
      })
    if (actionError) {
      return apiError(
        "action_audit_failed",
        "Die Assistant-Aktion konnte nicht vollständig protokolliert werden.",
        500,
      )
    }
  }

  const { committed_turn: _committedTurn, ...publicRuntime } = runtime

  return NextResponse.json({
    session: {
      id: session.id,
      transcript_retention_mode:
        assistantSettings.transcript_retention_mode,
    },
    turn: {
      id: turn.id,
      created_at: turn.created_at,
    },
    result: publicRuntime,
  })
}

async function loadSession(args: {
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]
  tenantId: string
  userId: string
  sessionId: string
}): Promise<
  | { id: string; context: Record<string, unknown>; last_turn_at: string | null }
  | { error: ReturnType<typeof apiError> }
> {
  const { data, error } = await args.supabase
    .from("assistant_sessions")
    .select("id, context, last_turn_at")
    .eq("id", args.sessionId)
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .maybeSingle()

  if (error) return { error: apiError("session_load_failed", "Assistant session could not be loaded.", 500) }
  if (!data) return { error: apiError("session_not_found", "Assistant session not found.", 404) }
  const row = data as { id: string; context?: unknown; last_turn_at?: string | null }
  return {
    id: row.id,
    context:
      row.context && typeof row.context === "object" && !Array.isArray(row.context)
        ? row.context as Record<string, unknown>
        : {},
    last_turn_at: row.last_turn_at ?? null,
  }
}

async function upsertSession(args: {
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]
  tenantId: string
  userId: string
  sessionId: string | null
  expectedLastTurnAt: string | null
  projectId: string | null
  lastIntent: string
  clientContextPath: string | null
  dialogState: import("@/lib/assistant/dialog-state").AssistantDialogState | null
}): Promise<
  | { id: string; error?: never }
  | { id?: never; error: ReturnType<typeof apiError> }
> {
  if (args.sessionId) {
    let query = args.supabase
      .from("assistant_sessions")
      .update({
        project_id: args.projectId,
        last_turn_at: new Date().toISOString(),
        last_intent: args.lastIntent,
        context: {
          client_context_path: args.clientContextPath,
          dialog_state: args.dialogState,
        },
      })
      .eq("id", args.sessionId)
      .eq("tenant_id", args.tenantId)
      .eq("user_id", args.userId)
    query = args.expectedLastTurnAt
      ? query.eq("last_turn_at", args.expectedLastTurnAt)
      : query.is("last_turn_at", null)
    const { data, error } = await query.select("id").maybeSingle()

    if (error) {
      return { error: apiError("session_update_failed", "Assistant session could not be updated.", 500) }
    }
    if (data) return { id: (data as { id: string }).id }
    return {
      error: apiError(
        "assistant_dialog_conflict",
        "Der Dialog wurde bereits geändert. Bitte lade den aktuellen Stand neu.",
        409,
      ),
    }
  }

  const { data, error } = await args.supabase
    .from("assistant_sessions")
    .insert({
      tenant_id: args.tenantId,
      user_id: args.userId,
      project_id: args.projectId,
      last_turn_at: new Date().toISOString(),
      last_intent: args.lastIntent,
      context: {
        client_context_path: args.clientContextPath,
        dialog_state: args.dialogState,
      },
    })
    .select("id")
    .single()

  if (error || !data) {
    return {
      error: apiError(
        "session_create_failed",
        error?.message ?? "Assistant session could not be created.",
        500,
      ),
    }
  }

  return { id: (data as { id: string }).id }
}
