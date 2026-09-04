import { NextResponse } from "next/server"
import { z } from "zod"

import { invokeClarifyingQuestionsGeneration } from "@/lib/ai/router"
import type {
  ProjectContextData,
  ProjectContextReasonCode,
  ProjectContextTurn,
} from "@/types/project-context"
import { emptyProjectContextData } from "@/types/project-context"

import { apiError, getAuthenticatedUserId } from "../../../../_lib/route-helpers"

export const maxDuration = 300

interface Ctx {
  params: Promise<{ id: string }>
}

const bodySchema = z.object({
  request_id: z.string().uuid(),
  expected_updated_at: z.string().datetime(),
})

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid draft id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Invalid body.",
      400,
      issue?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: draft, error: draftError } = await supabase
    .from("project_wizard_drafts")
    .select("id, tenant_id, data, updated_at")
    .eq("id", id)
    .maybeSingle()
  if (draftError) return apiError("read_failed", draftError.message, 500)
  if (!draft) return apiError("not_found", "Draft not found.", 404)
  if (draft.updated_at !== parsed.data.expected_updated_at) {
    return NextResponse.json(
      {
        error: {
          code: "conflict",
          message: "Draft was modified in another session. Reload before continuing.",
        },
        current_updated_at: draft.updated_at,
      },
      { status: 409 },
    )
  }

  const data = asRecord(draft.data)
  const projectContext = {
    ...emptyProjectContextData(),
    ...asRecord(data.project_context),
  } as ProjectContextData
  const turns = Array.isArray(projectContext.turns) ? projectContext.turns : []
  const turnId = `ai:${parsed.data.request_id}`
  const existing = turns.find((turn) => turn.id === turnId)
  if (existing) {
    return NextResponse.json({
      question: existing.content,
      turn: existing,
      replayed: true,
      updated_at: draft.updated_at,
    })
  }

  const assignments = Array.isArray(asRecord(data.skills).assignments)
    ? (asRecord(data.skills).assignments as unknown[])
    : []
  const skillIds = assignments
    .map((item) => trim(asRecord(item).skill_id))
    .filter((value, index, all) => z.string().uuid().safeParse(value).success && all.indexOf(value) === index)
    .slice(0, 100)

  const { data: skills, error: skillsError } = skillIds.length
    ? await supabase
        .from("skills")
        .select("id, name, current_version_id")
        .eq("tenant_id", draft.tenant_id)
        .in("id", skillIds)
        .eq("is_active", true)
        .limit(100)
    : { data: [], error: null }
  if (skillsError) return apiError("read_failed", skillsError.message, 500)
  if ((skills ?? []).length !== skillIds.length) {
    return apiError(
      "skill_snapshot_stale",
      "One or more selected skills are no longer active. Review the skill selection.",
      409,
    )
  }

  const versionIds = (skills ?? [])
    .map((skill) => skill.current_version_id as string | null)
    .filter((value): value is string => Boolean(value))
  const { data: versions, error: versionsError } = versionIds.length
    ? await supabase
        .from("skill_versions")
        .select("id, skill_id, version_number, markdown_content")
        .in("id", versionIds)
        .eq("status", "active")
        .limit(100)
    : { data: [], error: null }
  if (versionsError) return apiError("read_failed", versionsError.message, 500)
  if (versionIds.length !== (versions ?? []).length) {
    return apiError("skill_snapshot_stale", "An active skill version is missing.", 409)
  }

  const kickoff = asRecord(data.ki_backlog)
  const contextSourceId = trim(kickoff.context_source_id)
  const { data: source, error: sourceError } = contextSourceId
    ? await supabase
        .from("context_sources")
        .select("id, kind, title, privacy_class, content_excerpt, language")
        .eq("id", contextSourceId)
        .eq("tenant_id", draft.tenant_id)
        .maybeSingle()
    : { data: null, error: null }
  if (sourceError) return apiError("read_failed", sourceError.message, 500)

  const skillById = new Map((skills ?? []).map((skill) => [skill.id, skill]))
  const skillText = (versions ?? []).map((version) => {
    const skill = skillById.get(version.skill_id)
    return [
      `Skill: ${skill?.name ?? version.skill_id}`,
      `Version: ${version.id} (#${version.version_number})`,
      String(version.markdown_content).slice(0, 12000),
    ].join("\n")
  })
  const outbound = [
    "This is one adaptive project-context turn. Ask only one concrete question.",
    `Wizard frame: ${JSON.stringify({
      name: data.name,
      description: data.description,
      project_type: data.project_type,
      project_method: data.project_method,
      type_specific_data: data.type_specific_data,
    })}`,
    `Current reviewed context: ${JSON.stringify(projectContext)}`,
    source ? `Kickoff evidence: ${source.content_excerpt ?? ""}` : "No kickoff evidence was supplied.",
    `Selected immutable skill instructions:\n${skillText.join("\n\n")}`,
  ].join("\n\n").slice(0, 60000)

  const result = await invokeClarifyingQuestionsGeneration({
    supabase,
    tenantId: draft.tenant_id,
    wizardDraftId: id,
    actorUserId: userId,
    purpose: "skill_context_clarification",
    count: 1,
    context: {
      source_project: {
        name: trim(data.name) || "Neues Projekt",
        description: trim(data.description) || null,
        project_type: trim(data.project_type) || null,
        project_method: trim(data.project_method) || null,
      },
      context_source: {
        context_source_id: source?.id ?? id,
        kind: source?.kind ?? "wizard_skill_context",
        title: source?.title ?? "Projektkontext und ausgewählte Skills",
        privacy_class: (source?.privacy_class ?? 2) as 1 | 2 | 3,
        content_excerpt: outbound,
        language: source?.language ?? "de",
      },
    },
  })

  const question = result.questions[0]
  if (!question) {
    const reasonCode = (result.reason_code ?? null) as ProjectContextReasonCode | null
    const fallbackContext: ProjectContextData = {
      ...projectContext,
      analysis_status: "ai_interrupted",
      reason_code: reasonCode,
      finished: false,
    }
    const { data: fallbackUpdated, error: fallbackUpdateError } = await supabase
      .from("project_wizard_drafts")
      .update({ data: { ...data, project_context: fallbackContext } })
      .eq("id", id)
      .eq("updated_at", draft.updated_at)
      .select("updated_at")
      .maybeSingle()
    if (fallbackUpdateError) {
      return apiError("update_failed", fallbackUpdateError.message, 500)
    }
    if (!fallbackUpdated) {
      return apiError("conflict", "Draft changed while the provider was checked.", 409)
    }
    return NextResponse.json({
      question: null,
      run_id: result.run_id,
      status: result.status,
      reason_code: reasonCode,
      external_blocked: result.external_blocked,
      updated_at: fallbackUpdated.updated_at,
    })
  }

  const nextTurn: ProjectContextTurn = {
    id: turnId,
    role: "assistant",
    content: question.question,
    status: "complete",
  }
  const previousAssistant = turns.filter((turn) => turn.role === "assistant").slice(-2)
  if (previousAssistant.some((turn) => turn.content.trim() === nextTurn.content.trim())) {
    return NextResponse.json({
      question: null,
      run_id: result.run_id,
      status: "no_progress",
      reason_code: "provider_error",
      updated_at: draft.updated_at,
    })
  }

  const reasonCode = (result.reason_code ?? null) as ProjectContextReasonCode | null
  const nextContext: ProjectContextData = {
    ...projectContext,
    turns: [...turns, nextTurn],
    analysis_status: result.status === "success" ? "ai_analyzed" : "ai_interrupted",
    reason_code: reasonCode,
    finished: false,
  }
  const nextData = { ...data, project_context: nextContext }
  const { data: updated, error: updateError } = await supabase
    .from("project_wizard_drafts")
    .update({ data: nextData })
    .eq("id", id)
    .eq("updated_at", draft.updated_at)
    .select("updated_at")
    .maybeSingle()
  if (updateError) return apiError("update_failed", updateError.message, 500)
  if (!updated) {
    return apiError("conflict", "Draft changed while the question was generated.", 409)
  }

  return NextResponse.json({
    question: question.question,
    rationale: question.rationale,
    gap_tag: question.gap_tag,
    affected_skill_version_ids: versionIds,
    turn: nextTurn,
    run_id: result.run_id,
    status: result.status,
    reason_code: reasonCode,
    replayed: false,
    updated_at: updated.updated_at,
  })
}
