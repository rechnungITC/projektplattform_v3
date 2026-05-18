import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import { handleAssistantTurn } from "@/lib/assistant/runtime"
import { normalizeAssistantSettings } from "@/lib/assistant/settings"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const turnSchema = z.object({
  session_id: z.string().uuid().optional().nullable(),
  input_text: z.string().trim().min(1).max(5000),
  modality: z.enum(["text", "voice"]).default("text"),
  project_id: z.string().uuid().optional().nullable(),
  client_context_path: z.string().max(500).optional().nullable(),
})

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

  const runtime = await handleAssistantTurn({
    supabase,
    tenantId,
    userId,
    inputText: parsed.data.input_text,
    modality: parsed.data.modality,
    projectId: parsed.data.project_id ?? null,
    clientContextPath: parsed.data.client_context_path ?? null,
  })

  const session = await upsertSession({
    supabase,
    tenantId,
    userId,
    sessionId: parsed.data.session_id ?? null,
    projectId: runtime.project_id ?? parsed.data.project_id ?? null,
    lastIntent: runtime.recognized_intent,
    clientContextPath: parsed.data.client_context_path ?? null,
  })
  if (session.error) return session.error

  const persistedInput =
    runtime.transcript_persistence === "redacted"
      ? redactTranscript(parsed.data.input_text)
      : runtime.transcript_persistence === "metadata"
        ? null
        : null

  const { data: turn, error: turnError } = await supabase
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
      response_text: runtime.user_response,
      route_target: runtime.route_target,
      wizard_draft_id: runtime.wizard_draft?.id ?? null,
    })
    .select("id, created_at")
    .single()

  if (turnError || !turn) {
    return apiError(
      "turn_persist_failed",
      turnError?.message ?? "Assistant turn could not be saved.",
      500,
    )
  }

  await supabase.from("assistant_action_events").insert({
    tenant_id: tenantId,
    session_id: session.id,
    turn_id: (turn as { id: string }).id,
    user_id: userId,
    project_id: runtime.project_id ?? null,
    recognized_intent: runtime.recognized_intent,
    action_key: runtime.tool_calls[0]?.key ?? runtime.recognized_intent,
    confirmation_state: runtime.confirmation_state,
    executed_tools: runtime.tool_calls,
    result_status: runtime.result_status,
  })

  return NextResponse.json({
    session: {
      id: session.id,
      transcript_retention_mode:
        assistantSettings.transcript_retention_mode,
    },
    turn: {
      id: (turn as { id: string }).id,
      created_at: (turn as { created_at: string }).created_at,
    },
    result: runtime,
  })
}

async function upsertSession(args: {
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]
  tenantId: string
  userId: string
  sessionId: string | null
  projectId: string | null
  lastIntent: string
  clientContextPath: string | null
}): Promise<
  | { id: string; error?: never }
  | { id?: never; error: ReturnType<typeof apiError> }
> {
  if (args.sessionId) {
    const { data, error } = await args.supabase
      .from("assistant_sessions")
      .update({
        project_id: args.projectId,
        last_turn_at: new Date().toISOString(),
        last_intent: args.lastIntent,
        context: {
          client_context_path: args.clientContextPath,
        },
      })
      .eq("id", args.sessionId)
      .eq("tenant_id", args.tenantId)
      .eq("user_id", args.userId)
      .select("id")
      .maybeSingle()

    if (error) {
      return { error: apiError("session_update_failed", error.message, 500) }
    }
    if (data) return { id: (data as { id: string }).id }
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

function redactTranscript(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+?\d[\d\s()./-]{6,}\d/g, "[redacted-phone]")
    .slice(0, 5000)
}
