import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_EXAMPLE_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

import { createExampleSchema } from "../../_schema"

// PROJ-77-β — skill examples (admin only; authoring aids, not PM-facing).
//
// GET  /api/skills/[id]/examples  — list examples (ordered display_order, created_at).
// POST /api/skills/[id]/examples  — create an example.

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const { data, error } = await supabase
    .from("skill_examples")
    .select(SKILL_EXAMPLE_SELECT)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ examples: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid skill id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createExampleSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  // Confirm the skill is in this tenant (RLS-scoped) before adding.
  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (skillError) return apiError("fetch_failed", skillError.message, 500)
  if (!skill) return apiError("not_found", "Skill not found.", 404)

  const { data, error } = await supabase
    .from("skill_examples")
    .insert({
      skill_id: id,
      tenant_id: tenantId,
      title: parsed.data.title,
      input: parsed.data.input,
      expected_output: parsed.data.expected_output,
      tags: parsed.data.tags ?? [],
      display_order: parsed.data.display_order ?? 0,
      created_by: userId,
    })
    .select(SKILL_EXAMPLE_SELECT)
    .single()

  if (error) return apiError("create_failed", error.message, 500)
  return NextResponse.json({ example: data }, { status: 201 })
}
