import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import {
  ALLOWED_PARENT_KINDS,
  WORK_ITEM_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"
import type { ProjectMethod } from "@/types/project-method"

// Schemas live in `_schema.ts` so the drift-tests can introspect them.
import { workItemCreateSchema as createSchema } from "./_schema"

const WORK_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const

// -----------------------------------------------------------------------------
// POST /api/projects/[id]/work-items  --  create
// -----------------------------------------------------------------------------
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

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Resolve project tenant_id + project_method (RLS still applies).
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id, project_method")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  const method =
    (project as { project_method?: ProjectMethod | null }).project_method ??
    null
  const kind = parsed.data.kind as WorkItemKind

  // Method visibility check — bug is allowed in every method (cross-method);
  // when method is null ("not yet chosen"), every kind is creatable.
  if (method !== null && !WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)) {
    return apiError(
      "method_violation",
      `Kind '${kind}' is not visible in method '${method}'.`,
      422,
      "kind"
    )
  }

  // Parent-kind validation (defense in depth — DB trigger is the guarantee).
  if (parsed.data.parent_id) {
    const { data: parent, error: parentErr } = await supabase
      .from("work_items")
      .select("id, kind, project_id, is_deleted")
      .eq("id", parsed.data.parent_id)
      .maybeSingle()
    if (parentErr) return apiError("internal_error", parentErr.message, 500)
    if (!parent) return apiError("invalid_parent", "Parent not found.", 422, "parent_id")
    if (parent.project_id !== projectId) {
      return apiError("invalid_parent", "Parent is not in this project.", 422, "parent_id")
    }
    if (parent.is_deleted) {
      return apiError("invalid_parent", "Parent is deleted.", 422, "parent_id")
    }
    if (!ALLOWED_PARENT_KINDS[kind].includes(parent.kind as WorkItemKind)) {
      return apiError(
        "invalid_parent_kind",
        `${kind} cannot have a ${parent.kind} parent.`,
        422,
        "parent_id"
      )
    }
  } else if (parsed.data.parent_id === null || parsed.data.parent_id === undefined) {
    // No parent provided — verify top-level is allowed for this kind.
    if (!ALLOWED_PARENT_KINDS[kind].includes(null)) {
      return apiError(
        "invalid_parent_kind",
        `${kind} requires a parent.`,
        422,
        "parent_id"
      )
    }
  }

  // Spread-Pattern. Every schema field flows through automatically. DB
  // defaults (status='todo', priority='medium', attributes='{}') fire on
  // omitted keys. Drift-test in route.test.ts asserts every schema key
  // reaches the payload.
  const insertPayload = {
    ...parsed.data,
    // Server-only fields (NOT in Zod schema):
    tenant_id: project.tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("work_items")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ work_item: row }, { status: 201 })
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/work-items  --  list (filtered)
// -----------------------------------------------------------------------------
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

  const url = new URL(request.url)
  const kindParam = url.searchParams.get("kind")
  const statusParam = url.searchParams.get("status")
  const sprintParam = url.searchParams.get("sprint_id")
  const includeDeleted = url.searchParams.get("include_deleted") === "true"

  let query = supabase
    .from("work_items")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (!includeDeleted) query = query.eq("is_deleted", false)
  if (kindParam) {
    if (!(WORK_ITEM_KINDS as readonly string[]).includes(kindParam)) {
      return apiError("validation_error", "Invalid kind.", 400, "kind")
    }
    query = query.eq("kind", kindParam)
  }
  if (statusParam) {
    if (!(WORK_ITEM_STATUSES as readonly string[]).includes(statusParam)) {
      return apiError("validation_error", "Invalid status.", 400, "status")
    }
    query = query.eq("status", statusParam)
  }
  if (sprintParam) {
    if (!z.string().uuid().safeParse(sprintParam).success) {
      return apiError("validation_error", "Invalid sprint_id.", 400, "sprint_id")
    }
    query = query.eq("sprint_id", sprintParam)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ work_items: data ?? [] })
}
