import { NextResponse } from "next/server"
import { z } from "zod"

import { SKILL_KNOWLEDGE_LINK_SELECT } from "@/types/skill"

import { resolveActiveTenantId } from "../../../_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

import { createKnowledgeLinkSchema } from "../../_schema"

// PROJ-77-γ — skill knowledge links (admin only; link a skill to a DMS node).
//
// GET  /api/skills/[id]/knowledge-links  — list links.
// POST /api/skills/[id]/knowledge-links  — link a document node.

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
    .from("skill_knowledge_links")
    .select(SKILL_KNOWLEDGE_LINK_SELECT)
    .eq("skill_id", id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ links: data ?? [] })
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
  const parsed = createKnowledgeLinkSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  // Confirm the skill is in this tenant (RLS-scoped) before linking.
  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (skillError) return apiError("fetch_failed", skillError.message, 500)
  if (!skill) return apiError("not_found", "Skill not found.", 404)

  const { data, error } = await supabase
    .from("skill_knowledge_links")
    .insert({
      skill_id: id,
      document_node_id: parsed.data.document_node_id,
      tenant_id: tenantId,
      include_subtree: parsed.data.include_subtree ?? false,
      link_mode: parsed.data.link_mode ?? "reference",
      created_by: userId,
    })
    .select(SKILL_KNOWLEDGE_LINK_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "This document is already linked to the skill.",
        409,
        "document_node_id"
      )
    }
    // Tenant-consistency trigger (23514) or FK (23503): the node must be a
    // DMS node in this tenant.
    if (error.code === "23514" || error.code === "23503") {
      return apiError(
        "invalid_node",
        "The document node must belong to the same tenant.",
        422,
        "document_node_id"
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ link: data }, { status: 201 })
}
