import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "../../../_lib/route-helpers"

// PROJ-5 — finalize a wizard draft into a real project.
// POST /api/wizard-drafts/[id]/finalize
//
// Reads the draft (RLS gates ownership), inserts the project (RLS gates
// tenant membership for create), runs the PROJ-4 auto-lead bootstrap, then
// deletes the draft. If the project insert fails, the draft is preserved so
// the user can retry. If the draft delete fails after a successful insert,
// the project still ships — the orphan draft is recoverable from /projects/drafts.

interface Ctx {
  params: Promise<{ id: string }>
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isoDateOnly(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null
  // accept full ISO timestamp or YYYY-MM-DD; persist YYYY-MM-DD
  return value.slice(0, 10)
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const idParse = z.string().uuid().safeParse(id)
  if (!idParse.success) {
    return apiError("validation_error", "Invalid draft id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // 1) Load the draft (RLS hides drafts owned by other users → 404).
  const { data: draft, error: readErr } = await supabase
    .from("project_wizard_drafts")
    .select("id, tenant_id, data")
    .eq("id", id)
    .maybeSingle()
  if (readErr) {
    return apiError("read_failed", readErr.message, 500)
  }
  if (!draft) {
    return apiError("not_found", "Draft not found.", 404)
  }

  const data = (draft.data as Record<string, unknown>) ?? {}

  // 2) Validate the minimal field set required by POST /api/projects.
  const name = trimToNull(data.name)
  if (!name) {
    return apiError("validation_error", "Project name is required.", 422, "name")
  }
  const projectType = data.project_type
  if (!projectType || typeof projectType !== "string") {
    return apiError(
      "validation_error",
      "Project type is required.",
      422,
      "project_type"
    )
  }

  // PROJ-94 — M&A projects require a strategic foundation (sponsor + objective).
  // Validate up front so we never create a half-built M&A project.
  const maFoundation =
    projectType === "ma"
      ? ((data.ma_foundation ?? {}) as Record<string, unknown>)
      : null
  if (maFoundation) {
    if (!trimToNull(data.description)) {
      return apiError(
        "validation_error",
        "Objective (description) is required for M&A projects.",
        422,
        "description"
      )
    }
    const sponsorId = maFoundation.sponsor_user_id
    if (typeof sponsorId !== "string" || sponsorId.length === 0) {
      return apiError(
        "validation_error",
        "Sponsor is required for M&A projects.",
        422,
        "sponsor_user_id"
      )
    }
  }

  const responsibleUserId =
    typeof data.responsible_user_id === "string" && data.responsible_user_id.length > 0
      ? data.responsible_user_id
      : userId

  const insertPayload = {
    tenant_id: draft.tenant_id,
    name,
    description: trimToNull(data.description),
    project_number: trimToNull(data.project_number),
    planned_start_date: isoDateOnly(data.planned_start_date),
    planned_end_date: isoDateOnly(data.planned_end_date),
    responsible_user_id: responsibleUserId,
    project_type: projectType,
    project_method:
      typeof data.project_method === "string" ? data.project_method : null,
    type_specific_data: data.type_specific_data ?? {},
    created_by: userId,
  }

  // 3) Insert the project. RLS on `projects` gates tenant membership.
  const { data: project, error: insertErr } = await supabase
    .from("projects")
    .insert(insertPayload)
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === "42501") {
      return apiError(
        "forbidden",
        "Not allowed to create projects in this tenant.",
        403
      )
    }
    if (insertErr.code === "22023") {
      return apiError(
        "invalid_parameter",
        insertErr.message,
        422,
        "responsible_user_id"
      )
    }
    if (insertErr.code === "23514") {
      return apiError("constraint_violation", insertErr.message, 422)
    }
    return apiError("create_failed", insertErr.message, 500)
  }

  // 4) PROJ-4 auto-lead bootstrap (best-effort; the project is already created).
  if (project) {
    const { error: bootstrapErr } = await supabase.rpc(
      "bootstrap_project_lead",
      { p_project_id: project.id, p_user_id: userId }
    )
    if (bootstrapErr) {
      // Don't roll back — project lifecycle is preserved. Surface a 500 so
      // the caller knows lead bootstrap needs manual recovery.
      return apiError(
        "bootstrap_failed",
        `Project created (${project.id}) but auto-lead bootstrap failed: ${bootstrapErr.message}`,
        500
      )
    }
  }

  // 4.25) PROJ-94 — create the M&A strategic-foundation profile via the
  // SECURITY DEFINER RPC (the table has no INSERT policy; creation funnels here).
  // Runs in user context so auth.uid() authorizes the call. If this fails the
  // project exists but has no profile — surface a 500 so the gap is visible and
  // retriable (mirrors the bootstrap-failure contract above).
  if (project && maFoundation) {
    const amountRaw = maFoundation.investment_frame_amount
    const amountParsed =
      typeof amountRaw === "string" && amountRaw.trim().length > 0
        ? Number(amountRaw)
        : typeof amountRaw === "number"
          ? amountRaw
          : null
    const investmentAmount =
      amountParsed !== null && Number.isFinite(amountParsed) && amountParsed >= 0
        ? amountParsed
        : null
    const dealSide =
      typeof maFoundation.deal_side === "string" &&
      ["buy", "sell", "jv", "carve_out"].includes(maFoundation.deal_side)
        ? maFoundation.deal_side
        : null
    const confLevel =
      typeof maFoundation.confidentiality_level === "string" &&
      ["standard", "confidential", "strict"].includes(
        maFoundation.confidentiality_level
      )
        ? maFoundation.confidentiality_level
        : "standard"

    const { error: profileErr } = await supabase.rpc(
      "create_ma_project_profile",
      {
        p_project_id: project.id,
        p_sponsor_user_id: maFoundation.sponsor_user_id as string,
        p_deal_side: dealSide,
        p_deal_rationale: trimToNull(maFoundation.deal_rationale),
        p_search_profile: trimToNull(maFoundation.search_profile),
        p_exclusion_criteria: trimToNull(maFoundation.exclusion_criteria),
        p_investment_frame_amount: investmentAmount,
        p_investment_frame_currency: trimToNull(
          maFoundation.investment_frame_currency
        ),
        p_investment_frame_note: trimToNull(maFoundation.investment_frame_note),
        p_strategic_document_link: trimToNull(
          maFoundation.strategic_document_link
        ),
        p_confidentiality_level: confLevel,
      }
    )
    if (profileErr) {
      return apiError(
        "ma_profile_failed",
        `Project created (${project.id}) but M&A profile creation failed: ${profileErr.message}`,
        500
      )
    }
  }

  // 4.5) PROJ-70-ε — attach an uploaded kickoff context-source to the new
  // project (Post-Finalize-Handoff). The wizard's ki_backlog step uploaded
  // the file WITHOUT a project_id; now that the project exists we wire it up
  // so the Backlog drawer (deep-linked next) generates against this project.
  //
  // Best-effort: the project already exists, so a failed attach must not
  // fail finalize. Guarded by tenant_id + project_id IS NULL so a stale/
  // foreign source id can't be hijacked onto the new project.
  if (project) {
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
    if (contextSourceId) {
      // RLS already scopes to tenant-membership; the explicit tenant_id +
      // project_id IS NULL predicates are defense-in-depth.
      await supabase
        .from("context_sources")
        .update({ project_id: project.id })
        .eq("id", contextSourceId)
        .eq("tenant_id", draft.tenant_id)
        .is("project_id", null)
    }
  }

  // 5) Delete the draft (best-effort; orphan drafts are recoverable).
  await supabase.from("project_wizard_drafts").delete().eq("id", id)

  return NextResponse.json({ project }, { status: 201 })
}
