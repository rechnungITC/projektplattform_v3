import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createDeliverableDocumentSchema } from "../../_schema"

// PROJ-104 — external document links for a deliverable (AC4). Real file upload
// is deferred to PROJ-79 (docks onto this same table). RLS folds need-to-know
// via the parent deliverable.

const DOC_SELECT =
  "id, deliverable_id, title, url, tag_keys, created_by, created_at"

async function resolveDeliverable(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  projectId: string,
  did: string
) {
  const { data } = await supabase
    .from("deliverables")
    .select("id, tenant_id")
    .eq("id", did)
    .eq("project_id", projectId)
    .maybeSingle()
  return data as { id: string; tenant_id: string } | null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(did).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("deliverable_documents")
    .select(DOC_SELECT)
    .eq("deliverable_id", did)
    .order("created_at", { ascending: true })
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ documents: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(did).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createDeliverableDocumentSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const deliverable = await resolveDeliverable(supabase, projectId, did)
  if (!deliverable) return apiError("not_found", "Deliverable not found.", 404)

  const { data, error } = await supabase
    .from("deliverable_documents")
    .insert({
      tenant_id: deliverable.tenant_id,
      deliverable_id: did,
      title: parsed.data.title,
      url: parsed.data.url,
      tag_keys: parsed.data.tag_keys ?? [],
      created_by: userId,
    })
    .select(DOC_SELECT)
    .single()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ document: data }, { status: 201 })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const { id: projectId, did } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(did).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "manage_members"
  )
  if (access.error) return access.error

  const url = new URL(request.url)
  const docId = url.searchParams.get("document_id")
  if (!docId || !z.string().uuid().safeParse(docId).success) {
    return apiError("validation_error", "document_id query param required.", 400)
  }

  const { error } = await supabase
    .from("deliverable_documents")
    .delete()
    .eq("id", docId)
    .eq("deliverable_id", did)
  if (error) return apiError("delete_failed", error.message, 500)
  return NextResponse.json({ ok: true })
}
