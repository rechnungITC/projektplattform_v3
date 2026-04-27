import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const schema = z.object({
  predecessor_id: z.string().uuid(),
  successor_id: z.string().uuid(),
  type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lag_days: z.number().int().optional(),
})

/**
 * POST /api/projects/[id]/dependencies  --  create
 *
 * The DB enforces:
 *   - same-project guard (trigger `enforce_dependency_same_project`)
 *   - cycle prevention (trigger `prevent_dependency_cycle`)
 *   - uniqueness (predecessor_id, successor_id, type)
 *   - no self-edge
 *
 * Errors map to 422 with field-level diagnostics where possible.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  if (parsed.data.predecessor_id === parsed.data.successor_id) {
    return apiError(
      "self_dependency",
      "predecessor_id and successor_id must differ.",
      422,
      "successor_id"
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  // App-level same-project pre-check (the trigger is the guarantee, but we
  // surface a nicer error than SQLSTATE 22023).
  const { data: items, error: itemsErr } = await supabase
    .from("work_items")
    .select("id, project_id")
    .in("id", [parsed.data.predecessor_id, parsed.data.successor_id])
  if (itemsErr) return apiError("internal_error", itemsErr.message, 500)
  if (!items || items.length !== 2) {
    return apiError(
      "invalid_reference",
      "predecessor and/or successor not found.",
      422
    )
  }
  for (const it of items) {
    if (it.project_id !== projectId) {
      return apiError(
        "cross_project",
        "predecessor and successor must belong to this project.",
        422
      )
    }
  }

  const { data: row, error } = await supabase
    .from("dependencies")
    .insert({
      tenant_id: project.tenant_id,
      project_id: projectId,
      predecessor_id: parsed.data.predecessor_id,
      successor_id: parsed.data.successor_id,
      type: parsed.data.type,
      lag_days: parsed.data.lag_days ?? 0,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "duplicate_dependency",
        "This dependency already exists.",
        422
      )
    }
    if (error.code === "23514") {
      // Cycle prevention raises check_violation.
      return apiError(
        "cycle_detected",
        "This dependency would create a cycle.",
        422
      )
    }
    if (error.code === "22023") {
      return apiError("cross_project", error.message, 422)
    }
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ dependency: row }, { status: 201 })
}

/**
 * GET /api/projects/[id]/dependencies  --  list (RLS-scoped to project members)
 */
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

  const { data, error } = await supabase
    .from("dependencies")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ dependencies: data ?? [] })
}
