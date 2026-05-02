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

// -----------------------------------------------------------------------------
// Schemas — mirror the TS metamodel in src/types/work-item.ts (defense in
// depth: DB CHECK constraints + triggers are the actual guarantee).
// -----------------------------------------------------------------------------

const WORK_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const
const WORK_ITEM_PRIORITIES = ["low", "medium", "high", "critical"] as const

const createSchema = z.object({
  kind: z.enum(WORK_ITEM_KINDS as unknown as [string, ...string[]]),
  parent_id: z.string().uuid().nullable().optional(),
  phase_id: z.string().uuid().nullable().optional(),
  milestone_id: z.string().uuid().nullable().optional(),
  sprint_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.enum(WORK_ITEM_PRIORITIES).optional(),
  responsible_user_id: z.string().uuid().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  position: z.number().optional(),
  created_from_proposal_id: z.string().uuid().nullable().optional(),
  // PROJ-36 Phase 36-α — optional WBS-Code overrides on create. Without
  // these fields, the auto-generation trigger sets wbs_code from
  // outline_path. With wbs_code + wbs_code_is_custom=true, the user-supplied
  // code wins.
  wbs_code: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,50}$/, "Invalid WBS-Code format")
    .optional(),
  wbs_code_is_custom: z.boolean().optional(),
})

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

  const insertPayload = {
    tenant_id: project.tenant_id,
    project_id: projectId,
    kind,
    parent_id: parsed.data.parent_id ?? null,
    phase_id: parsed.data.phase_id ?? null,
    milestone_id: parsed.data.milestone_id ?? null,
    sprint_id: parsed.data.sprint_id ?? null,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    status: parsed.data.status ?? "todo",
    priority: parsed.data.priority ?? "medium",
    responsible_user_id: parsed.data.responsible_user_id ?? null,
    attributes: parsed.data.attributes ?? {},
    position: parsed.data.position ?? null,
    created_from_proposal_id: parsed.data.created_from_proposal_id ?? null,
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
