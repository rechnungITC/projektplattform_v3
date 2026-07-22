import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createTemplateSchema } from "../committees/[committeeId]/meetings/_schema"

// PROJ-117 (AC1) — committee template catalogue (tenant-scoped; tenant resolved
// from the project). GET list; POST create custom template (tenant-admin, RPC).

const COLS =
  "id, tenant_id, template_key, name, purpose, cadence, default_confidentiality, default_decision_scope, sort_order, is_active"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("committee_templates")
    .select(COLS)
    .eq("tenant_id", access.project.tenant_id)
    .order("sort_order", { ascending: true })
    .limit(200)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ templates: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createTemplateSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("create_committee_template", {
    p_tenant_id: access.project.tenant_id,
    p_template_key: d.template_key,
    p_name: d.name,
    p_purpose: d.purpose ?? null,
    p_cadence: d.cadence ?? null,
    p_default_confidentiality: d.default_confidentiality ?? "standard",
    p_default_decision_scope: d.default_decision_scope ?? null,
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Tenant admin required.", 403)
    if (error.code === "23505") return apiError("conflict", "A template with this key already exists.", 409, "template_key")
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ template: data }, { status: 201 })
}
