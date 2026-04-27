import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")

// PATCH only mutates master data + the soft-delete flag (used for restore).
// lifecycle_status, tenant_id, id, created_by, created_at, updated_at are
// explicitly NOT accepted here — lifecycle_status uses /transition.
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    project_number: z.string().max(100).nullable().optional(),
    planned_start_date: dateString.nullable().optional(),
    planned_end_date: dateString.nullable().optional(),
    responsible_user_id: z.string().uuid().optional(),
    project_method: z
      .enum(["scrum", "kanban", "safe", "waterfall", "pmi", "general"])
      .optional(),
    is_deleted: z.boolean().optional(),
  })
  .refine(
    (val) => {
      // Only validate the date order when BOTH are present in this PATCH.
      // (One-sided updates are accepted; the frontend handles cross-field UX.)
      if (!val.planned_start_date || !val.planned_end_date) return true
      return val.planned_end_date >= val.planned_start_date
    },
    {
      message: "planned_end_date must be on or after planned_start_date",
      path: ["planned_end_date"],
    }
  )
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

interface RouteContext {
  params: Promise<{ id: string }>
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id] -- detail (project + last 20 events)
// -----------------------------------------------------------------------------

export async function GET(_request: Request, context: RouteContext) {
  const { id: projectId } = await context.params

  const idCheck = z.string().uuid().safeParse(projectId)
  if (!idCheck.success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, tenant_id, name, description, project_number, planned_start_date, planned_end_date, responsible_user_id, lifecycle_status, project_type, created_by, created_at, updated_at, is_deleted"
    )
    .eq("id", projectId)
    .maybeSingle()

  if (projectError) {
    return apiError("read_failed", projectError.message, 500)
  }
  if (!project) {
    return apiError("not_found", "Project not found.", 404)
  }

  const { data: events, error: eventsError } = await supabase
    .from("project_lifecycle_events")
    .select("id, project_id, from_status, to_status, comment, changed_by, changed_at")
    .eq("project_id", projectId)
    .order("changed_at", { ascending: false })
    .limit(20)

  if (eventsError) {
    // Non-fatal: return the project with an empty events array.
    return NextResponse.json({ project, events: [] }, { status: 200 })
  }

  return NextResponse.json({ project, events: events ?? [] }, { status: 200 })
}

// -----------------------------------------------------------------------------
// PATCH /api/projects/[id] -- update master data (or restore via is_deleted)
// -----------------------------------------------------------------------------

export async function PATCH(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params

  const idCheck = z.string().uuid().safeParse(projectId)
  if (!idCheck.success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const updates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "22023") {
      return apiError("invalid_parameter", error.message, 422, "responsible_user_id")
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to update this project.", 403)
    }
    return apiError("update_failed", error.message, 500)
  }

  if (!data) {
    return apiError("not_found", "Project not found.", 404)
  }

  return NextResponse.json({ project: data }, { status: 200 })
}

// -----------------------------------------------------------------------------
// DELETE /api/projects/[id]            -- soft delete (admin OR member)
// DELETE /api/projects/[id]?hard=true  -- hard delete (admin only)
// -----------------------------------------------------------------------------

export async function DELETE(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params

  const idCheck = z.string().uuid().safeParse(projectId)
  if (!idCheck.success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  const url = new URL(request.url)
  const hard = url.searchParams.get("hard") === "true"

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // Resolve the project's tenant first; this also serves as a 404 / RLS check.
  const { data: project, error: lookupError } = await supabase
    .from("projects")
    .select("id, tenant_id, is_deleted")
    .eq("id", projectId)
    .maybeSingle()

  if (lookupError) {
    return apiError("read_failed", lookupError.message, 500)
  }
  if (!project) {
    return apiError("not_found", "Project not found.", 404)
  }

  if (hard) {
    // Hard-delete pre-check: must be admin of the project's tenant.
    const denied = await requireTenantAdmin(supabase, project.tenant_id, userId)
    if (denied) return denied

    // Use the service-role client to bypass RLS. The pre-check above is
    // what actually authorizes this branch — RLS would also allow it (admin),
    // but going through service-role removes any chance of an `auth.uid()`
    // resolution issue blocking the delete.
    let admin
    try {
      admin = createAdminClient()
    } catch (err) {
      return apiError(
        "server_misconfigured",
        err instanceof Error ? err.message : "Service role key unavailable.",
        500
      )
    }

    const { error: deleteError } = await admin
      .from("projects")
      .delete()
      .eq("id", projectId)

    if (deleteError) {
      return apiError("delete_failed", deleteError.message, 500)
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // Soft delete: just flip is_deleted. RLS allows admin or member; viewers
  // are blocked at the policy.
  const { data: updated, error: softDeleteError } = await supabase
    .from("projects")
    .update({ is_deleted: true })
    .eq("id", projectId)
    .select("id")
    .maybeSingle()

  if (softDeleteError) {
    if (softDeleteError.code === "42501") {
      return apiError("forbidden", "Not allowed to delete this project.", 403)
    }
    return apiError("delete_failed", softDeleteError.message, 500)
  }

  if (!updated) {
    return apiError("not_found", "Project not found.", 404)
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
