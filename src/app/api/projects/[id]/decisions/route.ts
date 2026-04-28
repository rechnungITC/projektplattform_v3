import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

// PROJ-20 — collection endpoint for decisions.
// GET  /api/projects/[id]/decisions?include_revised=false
// POST /api/projects/[id]/decisions  (handles new + revision via supersedes_decision_id)
//
// Decisions are append-only: there is no PATCH route. Revising a decision
// means POSTing a fresh body with `supersedes_decision_id` pointing at the
// predecessor. A DB trigger flips the predecessor's `is_revised` flag.

const createSchema = z.object({
  title: z.string().trim().min(1).max(255),
  decision_text: z.string().trim().min(1).max(10000),
  rationale: z.string().max(10000).optional().nullable(),
  decided_at: z
    .string()
    .min(1)
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid ISO timestamp")
    .optional(),
  decider_stakeholder_id: z.string().uuid().optional().nullable(),
  context_phase_id: z.string().uuid().optional().nullable(),
  context_risk_id: z.string().uuid().optional().nullable(),
  supersedes_decision_id: z.string().uuid().optional().nullable(),
})

const SELECT_COLUMNS =
  "id, tenant_id, project_id, title, decision_text, rationale, decided_at, decider_stakeholder_id, context_phase_id, context_risk_id, supersedes_decision_id, is_revised, created_by, created_at"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const includeRevised = url.searchParams.get("include_revised") === "true"

  let query = supabase
    .from("decisions")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .order("decided_at", { ascending: false })
    .limit(500)

  if (!includeRevised) {
    query = query.eq("is_revised", false)
  }

  const { data, error } = await query
  if (error) {
    return apiError("list_failed", error.message, 500)
  }
  return NextResponse.json({ decisions: data ?? [] })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const data = parsed.data

  // If this is a revision, the predecessor must live in the same project
  // (RLS would also block, but a 422 with a clear message is friendlier).
  if (data.supersedes_decision_id) {
    const { data: predecessor, error: lookupErr } = await supabase
      .from("decisions")
      .select("id, project_id, is_revised")
      .eq("id", data.supersedes_decision_id)
      .maybeSingle()
    if (lookupErr) {
      return apiError("read_failed", lookupErr.message, 500)
    }
    if (!predecessor || predecessor.project_id !== projectId) {
      return apiError(
        "not_found",
        "Predecessor decision not found in this project.",
        404,
        "supersedes_decision_id"
      )
    }
    if (predecessor.is_revised) {
      return apiError(
        "conflict",
        "This decision has already been revised. Revise the latest version.",
        409,
        "supersedes_decision_id"
      )
    }
  }

  const insertPayload = {
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    title: data.title.trim(),
    decision_text: data.decision_text.trim(),
    rationale: data.rationale?.trim() || null,
    decided_at: data.decided_at ?? new Date().toISOString(),
    decider_stakeholder_id: data.decider_stakeholder_id ?? null,
    context_phase_id: data.context_phase_id ?? null,
    context_risk_id: data.context_risk_id ?? null,
    supersedes_decision_id: data.supersedes_decision_id ?? null,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("decisions")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to log decisions.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ decision: row }, { status: 201 })
}
