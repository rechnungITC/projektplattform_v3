import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-45-α — section ↔ phase links (AC-45.18). PUT replaces the whole set
// with a diff, mirroring the workstream_phases route: one call, no partial
// state visible to the client.

const idSchema = z.string().uuid()

const putSchema = z.object({
  phase_ids: z.array(z.string().uuid()).max(200),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid } = await params
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(sid).success) {
    return apiError("invalid_id", "Malformed id.", 400)
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
    .from("construction_section_phases")
    .select("section_id, phase_id")
    .eq("section_id", sid)
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ links: data ?? [] })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id: projectId, sid } = await params
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(sid).success) {
    return apiError("invalid_id", "Malformed id.", 400)
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

  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const wanted = Array.from(new Set(parsed.data.phase_ids))

  const { data: existing, error: readError } = await supabase
    .from("construction_section_phases")
    .select("phase_id")
    .eq("section_id", sid)
    .limit(200)
  if (readError) return apiError("list_failed", readError.message, 500)

  const current = (existing ?? []).map((row) => row.phase_id as string)
  const toAdd = wanted.filter((phaseId) => !current.includes(phaseId))
  const toRemove = current.filter((phaseId) => !wanted.includes(phaseId))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("construction_section_phases")
      .delete()
      .eq("section_id", sid)
      .in("phase_id", toRemove)
    if (error) {
      if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
      return apiError("unlink_failed", error.message, 500)
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from("construction_section_phases").insert(
      toAdd.map((phaseId) => ({
        section_id: sid,
        phase_id: phaseId,
        tenant_id: access.project.tenant_id,
      }))
    )
    if (error) {
      // The guard rejects phases from another project or tenant.
      if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
      if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
      if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
      return apiError("link_failed", error.message, 500)
    }
  }

  return NextResponse.json({ linked: wanted.length, added: toAdd.length, removed: toRemove.length })
}
