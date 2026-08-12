import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { createWorkItemChecked } from "@/lib/work-items/create-work-item"
import { WORK_ITEM_KINDS } from "@/types/work-item"

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

  // Method visibility, parent-kind rules and the insert itself live in
  // `createWorkItemChecked` since PROJ-144 (D3) — the assistant confirmation
  // path goes through the exact same checks instead of duplicating them.
  // Behaviour, error codes and statuses are unchanged; the drift-test below
  // still runs through this call and remains the guard.
  const created = await createWorkItemChecked({
    supabase,
    userId,
    projectId,
    input: parsed.data,
  })

  if (!created.ok) {
    const { code, message, status, field } = created.failure
    return apiError(code, message, status, field)
  }

  return NextResponse.json({ work_item: created.row }, { status: 201 })
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
  // PROJ-101 — task filters: responsible person, phase, and due-window (Fristfenster).
  const responsibleParam = url.searchParams.get("responsible_user_id")
  const phaseParam = url.searchParams.get("phase_id")
  const dueAfterParam = url.searchParams.get("due_after")
  const dueBeforeParam = url.searchParams.get("due_before")
  const includeDeleted = url.searchParams.get("include_deleted") === "true"

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
  if (responsibleParam) {
    if (!z.string().uuid().safeParse(responsibleParam).success) {
      return apiError(
        "validation_error",
        "Invalid responsible_user_id.",
        400,
        "responsible_user_id"
      )
    }
    query = query.eq("responsible_user_id", responsibleParam)
  }
  if (phaseParam) {
    if (!z.string().uuid().safeParse(phaseParam).success) {
      return apiError("validation_error", "Invalid phase_id.", 400, "phase_id")
    }
    query = query.eq("phase_id", phaseParam)
  }
  if (dueAfterParam) {
    if (!DATE_RE.test(dueAfterParam)) {
      return apiError("validation_error", "Invalid due_after (YYYY-MM-DD).", 400, "due_after")
    }
    query = query.gte("due_date", dueAfterParam)
  }
  if (dueBeforeParam) {
    if (!DATE_RE.test(dueBeforeParam)) {
      return apiError("validation_error", "Invalid due_before (YYYY-MM-DD).", 400, "due_before")
    }
    query = query.lte("due_date", dueBeforeParam)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ work_items: data ?? [] })
}
