import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { NDA_SELECT, createNdaSchema } from "./_schema"

// PROJ-128 — NDA register for a project.
//
// GET  /api/projects/[id]/ndas  — list (project members; RLS-scoped).
// POST /api/projects/[id]/ndas  — create (tenant-admin or project lead).

export async function GET(
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

  const { data, error } = await supabase
    .from("ma_ndas")
    .select(NDA_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ ndas: data ?? [] })
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
  const parsed = createNdaSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase
    .from("ma_ndas")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      counterparty: parsed.data.counterparty,
      responsible_user_id: parsed.data.responsible_user_id ?? null,
      status: parsed.data.status ?? "draft",
      signed_date: parsed.data.signed_date ?? null,
      valid_from: parsed.data.valid_from ?? null,
      valid_until: parsed.data.valid_until ?? null,
      scope_kind: parsed.data.scope_kind ?? "project",
      scope_ref: parsed.data.scope_ref ?? null,
      covered_level: parsed.data.covered_level ?? "confidential",
      document_link: parsed.data.document_link ?? null,
      reminder_date: parsed.data.reminder_date ?? null,
      notes: parsed.data.notes ?? null,
      created_by: userId,
    })
    .select(NDA_SELECT)
    .single()

  if (error) return apiError("create_failed", error.message, 500)
  return NextResponse.json({ nda: data }, { status: 201 })
}
