import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../_lib/route-helpers"

// PROJ-11 — promote a stakeholder into a resource.
// POST /api/stakeholders/[id]/promote-to-resource
//
// Behavior:
//   - If the stakeholder has a linked_user_id and a resource for that user
//     already exists in the tenant, link the stakeholder to it (and return
//     {created:false}).
//   - Otherwise, create a new resource row populated from the stakeholder
//     (display_name, kind, linked_user_id) and return {created:true}.

const RESOURCE_COLUMNS =
  "id, tenant_id, source_stakeholder_id, linked_user_id, display_name, kind, fte_default, availability_default, is_active, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, ctx: Ctx) {
  const { id: stakeholderId } = await ctx.params
  if (!z.string().uuid().safeParse(stakeholderId).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: stakeholder, error: sErr } = await supabase
    .from("stakeholders")
    .select("id, tenant_id, project_id, name, kind, linked_user_id")
    .eq("id", stakeholderId)
    .maybeSingle()
  if (sErr) return apiError("read_failed", sErr.message, 500)
  if (!stakeholder) return apiError("not_found", "Stakeholder not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    stakeholder.tenant_id as string,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const linkedUserId = stakeholder.linked_user_id as string | null

  // Try to find an existing resource for the same linked user in this tenant.
  if (linkedUserId) {
    const { data: existing, error: existingErr } = await supabase
      .from("resources")
      .select(RESOURCE_COLUMNS)
      .eq("tenant_id", stakeholder.tenant_id as string)
      .eq("linked_user_id", linkedUserId)
      .maybeSingle()
    if (existingErr) return apiError("read_failed", existingErr.message, 500)

    if (existing) {
      // Already exists — just record the source link if missing.
      if (!existing.source_stakeholder_id) {
        await supabase
          .from("resources")
          .update({ source_stakeholder_id: stakeholderId })
          .eq("id", existing.id)
      }
      return NextResponse.json({ resource: existing, created: false })
    }
  }

  // Create a new resource.
  // Stakeholder.kind values mirror "internal" / "external" closely enough
  // for an MVP default; if it's anything else (e.g. "individual"), we
  // default to "internal" — admins can flip kind later.
  const resourceKind =
    stakeholder.kind === "external" ? "external" : "internal"

  const { data: row, error } = await supabase
    .from("resources")
    .insert({
      tenant_id: stakeholder.tenant_id as string,
      source_stakeholder_id: stakeholderId,
      linked_user_id: linkedUserId,
      display_name: (stakeholder.name as string).trim().slice(0, 200),
      kind: resourceKind,
      created_by: userId,
    })
    .select(RESOURCE_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or admin role required.", 403)
    }
    if (error.code === "23505") {
      // Race: another request created the resource just now. Re-read and return.
      const { data: existing } = await supabase
        .from("resources")
        .select(RESOURCE_COLUMNS)
        .eq("tenant_id", stakeholder.tenant_id as string)
        .eq("linked_user_id", linkedUserId)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ resource: existing, created: false })
      }
    }
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ resource: row, created: true }, { status: 201 })
}
