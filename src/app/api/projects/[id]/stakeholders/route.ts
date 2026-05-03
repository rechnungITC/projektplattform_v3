import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"
import {
  normalizeStakeholderPayload,
  stakeholderCreateSchema as createSchema,
} from "./_schema"

// PROJ-8 — collection endpoint for project stakeholders.
// GET  /api/projects/[id]/stakeholders?include_inactive=false
// POST /api/projects/[id]/stakeholders

// Schema lives in `_schema.ts` so the drift-test can introspect it.
// See `route.test.ts` "drift" describe block.

interface Ctx {
  params: Promise<{ id: string }>
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/stakeholders
// -----------------------------------------------------------------------------

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const includeInactive = url.searchParams.get("include_inactive") === "true"

  let query = supabase
    .from("stakeholders")
    .select(
      "id, tenant_id, project_id, kind, origin, name, role_key, org_unit, contact_email, contact_phone, influence, impact, linked_user_id, notes, is_active, is_approver, reasoning, stakeholder_type_key, management_level, decision_authority, attitude, conflict_potential, communication_need, preferred_channel, created_by, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })

  if (!includeInactive) {
    query = query.eq("is_active", true)
  }

  const { data, error } = await query
  if (error) {
    return apiError("list_failed", error.message, 500)
  }
  return NextResponse.json({ stakeholders: data ?? [] })
}

// -----------------------------------------------------------------------------
// POST /api/projects/[id]/stakeholders
// -----------------------------------------------------------------------------

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

  // Spread-Pattern: Schema is the single source of truth. Every field the
  // schema accepts flows through to the DB automatically. Only string fields
  // need normalization (trim → NULL on empty); enums/booleans/UUIDs pass
  // through unchanged. New schema fields will appear in the payload
  // automatically — no manual mapping list to forget.
  //
  // Drift-test in route.test.ts asserts every schema key lands in the DB
  // payload. If a future contributor adds a field to _schema.ts but it
  // doesn't propagate, the test fails loudly.
  const insertPayload = {
    ...normalizeStakeholderPayload(parsed.data),
    // Server-only fields (NOT in Zod schema):
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("stakeholders")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to add stakeholders.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ stakeholder: row }, { status: 201 })
}
