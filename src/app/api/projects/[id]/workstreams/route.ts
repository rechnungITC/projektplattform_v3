import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createWorkstreamSchema, WORKSTREAM_SELECT } from "./_schema"

// PROJ-102 — Workstreams for a project.
//
// GET  /api/projects/[id]/workstreams  — list (project members; RLS + need-to-know).
// POST /api/projects/[id]/workstreams  — create (tenant-admin or project lead).

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
    .from("workstreams")
    .select(WORKSTREAM_SELECT)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ workstreams: data ?? [] })
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
  const parsed = createWorkstreamSchema.safeParse(body)
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
    .from("workstreams")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      workstream_key: parsed.data.workstream_key,
      label: parsed.data.label,
      goal: parsed.data.goal ?? null,
      lead_user_id: parsed.data.lead_user_id ?? null,
      rag_status: parsed.data.rag_status ?? "green",
      scope: parsed.data.scope ?? null,
      notes: parsed.data.notes ?? null,
      confidentiality_level: parsed.data.confidentiality_level ?? "standard",
      sort_order: parsed.data.sort_order ?? 0,
      created_by: userId,
    })
    .select(WORKSTREAM_SELECT)
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "conflict",
        "A workstream with this key already exists in this project.",
        409,
        "workstream_key"
      )
    }
    if (error.code === "23503") {
      return apiError("validation_error", "Unknown user.", 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ workstream: data }, { status: 201 })
}
