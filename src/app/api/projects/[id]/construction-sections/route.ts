import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

// PROJ-45-α — construction sections (Bauabschnitte), a free-depth tree.
//
// GET  — the whole tree as a flat list; the client assembles it (same approach
//        as the DMS and organisation trees). `path` is trigger-maintained.
// POST — create a node, optionally under a parent. Cycle and cross-project
//        parents are rejected in the database (AC-45.14).

export const SECTION_SELECT =
  "id, tenant_id, project_id, parent_id, label, description, sort_order, " +
  "path, created_at, updated_at"

const idSchema = z.string().uuid()

export const createSectionSchema = z.object({
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // AC-45.24: module off -> the surface answers as if it did not exist.
  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("construction_sections")
    .select(SECTION_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(2000)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ sections: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = createSectionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const { data, error } = await supabase
    .from("construction_sections")
    .insert({
      ...parsed.data,
      project_id: projectId,
      tenant_id: access.project.tenant_id,
      created_by: userId,
    })
    .select(SECTION_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "duplicate_label",
        "Unter diesem Abschnitt gibt es bereits einen gleichnamigen Eintrag.",
        409
      )
    }
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ section: data }, { status: 201 })
}
