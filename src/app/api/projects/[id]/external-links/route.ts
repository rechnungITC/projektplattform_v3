import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { validateExternalUrl } from "@/lib/ma-project/external-link-validation"
import { EXTERNAL_LINK_ENTITY_TYPES } from "@/types/external-link"

// PROJ-115 — external datorroom links for a DD object (Q&A / finding / task /
// deliverable). Polymorphic table; need-to-know is enforced by the RESTRICTIVE
// can_access_classified gates on external_document_links (via the parent). The
// URL is validated statically (SSRF-safe) but NEVER fetched server-side.
// Session client only, never service-role.

const LINK_SELECT =
  "id, tenant_id, entity_type, entity_id, url, label, added_by, created_at"

const entitySchema = z.enum(
  EXTERNAL_LINK_ENTITY_TYPES as [string, ...string[]]
)

const createSchema = z.object({
  entity_type: entitySchema,
  entity_id: z.string().uuid(),
  url: z.string().trim().min(1).max(2000),
  label: z.string().trim().max(200).nullable().optional(),
})

// GET /api/projects/[id]/external-links?entity_type=&entity_id=
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const url = new URL(request.url)
  const et = entitySchema.safeParse(url.searchParams.get("entity_type"))
  const ei = z.string().uuid().safeParse(url.searchParams.get("entity_id"))
  if (!et.success || !ei.success) {
    return apiError("validation_error", "entity_type + entity_id required.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("external_document_links")
    .select(LINK_SELECT)
    .eq("entity_type", et.data)
    .eq("entity_id", ei.data)
    .order("created_at", { ascending: true })
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ links: data ?? [] })
}

// POST /api/projects/[id]/external-links
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }

  // SSRF-safe static URL validation (never fetched server-side).
  const urlCheck = validateExternalUrl(parsed.data.url)
  if (!urlCheck.ok) {
    return apiError("validation_error", urlCheck.error ?? "Ungültige URL.", 400, "url")
  }

  const { data, error } = await supabase
    .from("external_document_links")
    .insert({
      tenant_id: access.project.tenant_id,
      entity_type: parsed.data.entity_type,
      entity_id: parsed.data.entity_id,
      url: parsed.data.url,
      label: parsed.data.label ?? null,
      added_by: userId,
    })
    .select(LINK_SELECT)
    .single()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "23503") return apiError("not_found", "Zielobjekt nicht gefunden.", 404)
    if (error.code === "23514") return apiError("validation_error", error.message, 400)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ link: data }, { status: 201 })
}

// DELETE /api/projects/[id]/external-links?link_id=
export async function DELETE(
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

  const linkId = new URL(request.url).searchParams.get("link_id")
  if (!linkId || !z.string().uuid().safeParse(linkId).success) {
    return apiError("validation_error", "link_id query param required.", 400)
  }
  const { error } = await supabase
    .from("external_document_links")
    .delete()
    .eq("id", linkId)
    .eq("tenant_id", access.project.tenant_id)
  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
