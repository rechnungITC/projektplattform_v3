import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"
import { SECTION_SELECT } from "../route"

// PROJ-45-α — one section: rename, move (parent change), reorder, delete.
// Moving re-paths the whole subtree in the database (AC-45.13); deleting
// cascades to descendants so no orphans can appear (AC-45.15).

const idSchema = z.string().uuid()

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    parent_id: z.string().uuid().nullable().optional(),
    sort_order: z.number().int().min(0).max(100000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })

async function gate(projectId: string, sid: string) {
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(sid).success) {
    return { error: apiError("invalid_id", "Malformed id.", 400) }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return { error: access.error }
  return { supabase }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid } = await params
  const gated = await gate(projectId, sid)
  if (gated.error) return gated.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  // A node may not become its own parent. Deeper cycles are caught by the
  // database trigger, which compares materialised paths.
  if (parsed.data.parent_id === sid) {
    return apiError("invalid_parent", "Ein Abschnitt kann nicht sein eigener Elternknoten sein.", 422)
  }

  const { data, error } = await gated.supabase
    .from("construction_sections")
    .update(parsed.data)
    .eq("id", sid)
    .eq("project_id", projectId)
    .select(SECTION_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "23514") {
      return apiError("cycle_rejected", "Dieser Zug würde einen Zyklus erzeugen.", 422)
    }
    if (error.code === "23505") {
      return apiError(
        "duplicate_label",
        "Unter dem Zielknoten gibt es bereits einen gleichnamigen Abschnitt.",
        409
      )
    }
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Section not found.", 404)

  return NextResponse.json({ section: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid } = await params
  const gated = await gate(projectId, sid)
  if (gated.error) return gated.error

  const { error } = await gated.supabase
    .from("construction_sections")
    .delete()
    .eq("id", sid)
    .eq("project_id", projectId)

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }

  return NextResponse.json({ ok: true })
}
