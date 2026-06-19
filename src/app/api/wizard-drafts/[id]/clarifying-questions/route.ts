/**
 * PROJ-135 — dialogic wizard clarifying questions.
 *
 *   POST /api/wizard-drafts/[id]/clarifying-questions
 *     Body: { count?: 1–6 (default 5) }
 *     → reads the draft's kickoff context_source + frame (name / Vorhaben /
 *       type / method), runs `invokeClarifyingQuestionsGeneration` and returns
 *       the run result + generated questions.
 *
 * This runs in the wizard BEFORE finalize — there is NO project yet. The
 * draft id is the ki_runs correlation anchor (`wizard_draft_id`); the run is
 * recorded with project_id = null (bounded to this purpose). It is fail-open:
 * an external-blocked / errored / Stub run returns an empty question list with
 * a 200 so the wizard step never blocks finalize (AC-135.7/10).
 *
 * Auth: the draft is RLS-scoped to its owner (404 if not). The contextSource
 * is taken from the draft (NOT the request body) so a caller can't point the
 * run at an arbitrary source.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { collectClarifyingQuestionsAutoContext } from "@/lib/ai/auto-context"
import { invokeClarifyingQuestionsGeneration } from "@/lib/ai/router"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import { apiError, getAuthenticatedUserId } from "../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

const postBodySchema = z.object({
  count: z.number().int().min(1).max(6).default(5),
})

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid draft id.", 400, "id")
  }

  let body: unknown = {}
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json()
    } catch {
      body = {}
    }
  }
  const parsed = postBodySchema.safeParse(
    typeof body === "object" && body !== null ? body : {},
  )
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Load the draft (RLS hides drafts owned by other users → 404).
  const { data: draft, error: readErr } = await supabase
    .from("project_wizard_drafts")
    .select("id, tenant_id, data")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return apiError("read_failed", readErr.message, 500)
  if (!draft) return apiError("not_found", "Draft not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    draft.tenant_id,
    "ai_proposals",
    { intent: "write" },
  )
  if (moduleDenial) return moduleDenial

  const data = (draft.data as Record<string, unknown>) ?? {}
  const kiBacklog = (data.ki_backlog ?? null) as {
    enabled?: unknown
    context_source_id?: unknown
  } | null
  const contextSourceId =
    kiBacklog &&
    kiBacklog.enabled === true &&
    typeof kiBacklog.context_source_id === "string" &&
    kiBacklog.context_source_id.length > 0
      ? kiBacklog.context_source_id
      : null

  // No kickoff uploaded → nothing to ask about. Fail-open: empty list, 200.
  if (!contextSourceId) {
    return NextResponse.json(
      {
        run_id: null,
        questions: [],
        external_blocked: false,
        skipped_reason: "no_kickoff_source",
      },
      { status: 200 },
    )
  }

  const frame = {
    name: trimToNull(data.name) ?? "Neues Projekt",
    description: trimToNull(data.description),
    project_type:
      typeof data.project_type === "string" ? data.project_type : null,
    project_method:
      typeof data.project_method === "string" ? data.project_method : null,
  }

  let context
  try {
    context = await collectClarifyingQuestionsAutoContext(
      supabase,
      contextSourceId,
      frame,
    )
  } catch (err) {
    return apiError(
      "context_failed",
      err instanceof Error ? err.message : "Failed to collect context.",
      500,
    )
  }

  const result = await invokeClarifyingQuestionsGeneration({
    supabase,
    tenantId: draft.tenant_id,
    wizardDraftId: id,
    actorUserId: userId,
    context,
    count: parsed.data.count,
  })

  return NextResponse.json(result, { status: 200 })
}
