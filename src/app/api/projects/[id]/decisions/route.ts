import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"
import {
  decisionCreateSchema as createSchema,
  normalizeDecisionPayload,
} from "./_schema"

// PROJ-20 — collection endpoint for decisions.
// GET  /api/projects/[id]/decisions?include_revised=false
// POST /api/projects/[id]/decisions  (handles new + revision via supersedes_decision_id)
//
// Decisions are append-only: there is no PATCH route. Revising a decision
// means POSTing a fresh body with `supersedes_decision_id` pointing at the
// predecessor. A DB trigger flips the predecessor's `is_revised` flag.
//
// Schema lives in `_schema.ts` so the drift-test can introspect it.

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

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

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

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "decisions",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

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

  // Spread-Pattern: schema is the single source of truth. New schema fields
  // flow through automatically. Drift-test in route.test.ts asserts every
  // schema key reaches this payload.
  const insertPayload = {
    ...normalizeDecisionPayload(data),
    decided_at: data.decided_at ?? new Date().toISOString(),
    // Server-only fields (NOT in Zod schema):
    tenant_id: access.project.tenant_id,
    project_id: projectId,
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
