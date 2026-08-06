import { NextResponse } from "next/server"
import { z } from "zod"

import { detectClass3Markers } from "@/lib/ai/classify"
import {
  appendWithinCap,
  readClarifyingAnswers,
  renderQaBlock,
} from "@/lib/context-ingestion/clarifying-qa"

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

  // Non-fatal warnings surfaced in the 201 response so the wizard can toast them
  // (PROJ-141-γ2 + PROJ-Y-96b + PROJ-Y-96e). Best-effort finalize steps push
  // here instead of failing hard. Y-96b/e widen the shape with optional
  // structured fields so the FE can drill down without losing the flat
  // `code + message` toast contract.
  const warnings: {
    code: string
    message: string
    target_type?: string
    target_key?: string
    role_key?: string
    task_key?: string
    workstream_key?: string
    phase_key?: string
    parent_task_key?: string
  }[] = []

  // PROJ-Y-96b: server-side aggregation of the apply-RPC's per-row RACI
  // warnings so a Buy-Side-Default apply against an empty tenant does not spam
  // the toast with one entry per (target × role). Groups by (code, role_key)
  // and formats a concise German message with the affected-target count.
  //
  // PROJ-Y-96e: task-skip warnings (`skipped_*`) stay individual entries
  // because each row is a distinct actionable case (unlike RACI which repeats
  // the same 3 role_keys × N targets on the Buy-Side default). The full raw
  // list still rides in the 201 payload under `template_result.warnings` for
  // FE drill-down.
  interface RpcWarning {
    code:
      | "raci_unknown_role_key"
      | "raci_orphan_target"
      | "skipped_task_missing_workstream"
      | "skipped_task_missing_phase"
      | "skipped_subtask_missing_workstream"
      | "skipped_subtask_missing_phase"
      | "skipped_subtask_parent_missing"
    target_type?: string
    target_key?: string
    role_key?: string
    task_key?: string
    workstream_key?: string
    phase_key?: string
    parent_task_key?: string
  }
  function aggregateTemplateWarnings(raw: RpcWarning[]): typeof warnings {
    const out: typeof warnings = []
    // Y-96b RACI aggregation — group by (code, role_key), count targets.
    const raciGroups = new Map<
      string,
      { code: RpcWarning["code"]; role_key?: string; count: number }
    >()
    for (const w of raw) {
      if (w.code === "raci_unknown_role_key" || w.code === "raci_orphan_target") {
        const key = `${w.code}::${w.role_key ?? ""}`
        const existing = raciGroups.get(key)
        if (existing) existing.count += 1
        else raciGroups.set(key, { code: w.code, role_key: w.role_key, count: 1 })
      }
    }
    for (const g of raciGroups.values()) {
      if (g.code === "raci_unknown_role_key") {
        out.push({
          code: g.code,
          role_key: g.role_key,
          message: `Rolle „${g.role_key ?? "?"}" ist im Tenant nicht bekannt (${g.count} RACI-Zuweisung${g.count === 1 ? "" : "en"} aus der Vorlage). Zuweisung wurde gestempelt — legen Sie die Rolle unter Stammdaten an, damit Tagessätze und Zuweisungen ineinandergreifen.`,
        })
      } else {
        out.push({
          code: g.code,
          role_key: g.role_key,
          message: `RACI-Vorlage verweist auf ${g.count} unbekannte${g.count === 1 ? "s" : ""} Ziel${g.count === 1 ? "" : "e"} — Zeile${g.count === 1 ? "" : "n"} übersprungen.`,
        })
      }
    }
    // Y-96e task-skip warnings — one entry per skipped row.
    for (const w of raw) {
      if (w.code.startsWith("skipped_")) {
        const detail =
          w.task_key && w.workstream_key
            ? `${w.task_key} → ${w.workstream_key}`
            : w.task_key && w.phase_key
              ? `${w.task_key} → Phase ${w.phase_key}`
              : w.task_key && w.parent_task_key
                ? `${w.task_key} → ${w.parent_task_key}`
                : (w.task_key ?? "")
        out.push({
          code: w.code,
          task_key: w.task_key,
          workstream_key: w.workstream_key,
          phase_key: w.phase_key,
          parent_task_key: w.parent_task_key,
          message: `Vorlage angewendet — eine Zeile wurde übersprungen (${w.code}${detail ? `: ${detail}` : ""}).`,
        })
      }
    }
    return out
  }

  // 4.3) PROJ-96 + PROJ-Y-96b + PROJ-Y-96e — apply the selected M&A project
  // template (copy-on-create). The template_id rides in the ma_foundation step.
  // Best-effort: the project is already usable without it, and an admin can
  // apply a template later via /api/projects/[id]/apply-template — so a
  // failure here must NOT roll back the project or block finalize.
  //
  // PROJ-141-γ2 (M-2): evaluate the RPC error instead of swallowing it. A silent
  // failure left the user in a structurally empty project room while the wizard
  // reported success.
  //
  // PROJ-Y-96b + Y-96e: on success, forward the RPC's structured `warnings[]`
  // (RACI orphans + unknown roles + task-copy skips) — aggregated into the
  // top-level warnings array for toast + attached raw under `template_result`
  // for drill-down.
  let templateResult: Record<string, unknown> | null = null
  if (project && maFoundation) {
    const templateId = maFoundation.template_id
    const isUuid =
      typeof templateId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        templateId
      )
    if (isUuid) {
      const { data: templateData, error: templateErr } = await supabase.rpc(
        "apply_ma_project_template",
        {
          p_project_id: project.id,
          p_template_id: templateId,
        }
      )
      if (templateErr) {
        console.error(
          `[finalize] apply_ma_project_template failed for project ${project.id}, template ${templateId}: ${templateErr.message}`
        )
        warnings.push({
          code: "template_apply_failed",
          message:
            "Projekt angelegt — die Projekt-Vorlage konnte nicht übernommen werden. Sie kann später in den Projekteinstellungen angewendet werden.",
        })
      } else if (templateData && typeof templateData === "object") {
        templateResult = templateData as Record<string, unknown>
        const rawWarnings = (templateResult.warnings ?? []) as unknown
        if (Array.isArray(rawWarnings) && rawWarnings.length > 0) {
          // The consolidation migration returns jsonb objects `{code, ...}`
          // for BOTH the Y-96b RACI-copy and the Y-96e task-copy warning
          // classes. Filter out any non-object entries defensively.
          const structured = rawWarnings.filter(
            (r): r is RpcWarning =>
              !!r &&
              typeof r === "object" &&
              typeof (r as { code?: unknown }).code === "string"
          )
          for (const aggr of aggregateTemplateWarnings(structured)) {
            warnings.push(aggr)
          }
        }
      }
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
      // PROJ-135 — persist the answered clarifying Q&A onto the kickoff source
      // (Option B-modified): append to content_excerpt (collector- AND
      // classifier-visible), mirror to source_metadata for audit, and re-stamp
      // privacy_class. The Vorhaben (projects.description) is untouched.
      const answers = readClarifyingAnswers(data)
      const update: {
        project_id: string
        content_excerpt?: string
        privacy_class?: number
        source_metadata?: Record<string, unknown>
      } = { project_id: project.id }

      if (answers.length > 0) {
        const { data: cs } = await supabase
          .from("context_sources")
          .select("content_excerpt, privacy_class, source_metadata")
          .eq("id", contextSourceId)
          .eq("tenant_id", draft.tenant_id)
          .is("project_id", null)
          .maybeSingle()
        if (cs) {
          const qaBlock = renderQaBlock(answers)
          const currentExcerpt = (cs.content_excerpt as string | null) ?? ""
          update.content_excerpt = appendWithinCap(currentExcerpt, qaBlock)

          // AC-135.4b — re-stamp on persist: the Q&A is free user text and may
          // introduce PII. Raise (never lower) privacy_class on a marker hit so
          // a Class-2 source carrying PII answers becomes Class-3 BEFORE any
          // downstream cloud generation reads it.
          const currentClass = (cs.privacy_class as number | null) ?? 3
          update.privacy_class = detectClass3Markers(qaBlock)
            ? Math.max(currentClass, 3)
            : currentClass

          // Audit mirror (full Q&A) — source_metadata is never fed to the AI.
          const meta = (cs.source_metadata as Record<string, unknown> | null) ?? {}
          update.source_metadata = {
            ...meta,
            proj135_clarifying_qa: {
              answered_at: new Date().toISOString(),
              wizard_draft_id: id,
              answers,
            },
          }
        }
      }

      // RLS already scopes to tenant-membership; the explicit tenant_id +
      // project_id IS NULL predicates are defense-in-depth.
      await supabase
        .from("context_sources")
        .update(update)
        .eq("id", contextSourceId)
        .eq("tenant_id", draft.tenant_id)
        .is("project_id", null)

      // AC-135.11 — best-effort re-link the project-less clarifying ki_run(s)
      // recorded during the wizard to the now-created project.
      await supabase
        .from("ki_runs")
        .update({ project_id: project.id })
        .eq("wizard_draft_id", id)
        .eq("tenant_id", draft.tenant_id)
        .eq("purpose", "clarifying_questions_from_context")
        .is("project_id", null)
    }
  }

  // 5) Delete the draft (best-effort; orphan drafts are recoverable).
  await supabase.from("project_wizard_drafts").delete().eq("id", id)

  return NextResponse.json(
    { project, warnings, template_result: templateResult },
    { status: 201 }
  )
}
