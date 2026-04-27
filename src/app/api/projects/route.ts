import { NextResponse } from "next/server"
import { z } from "zod"

import {
  decodeCursor,
  encodeCursor,
  LIFECYCLE_STATUSES,
  PROJECT_TYPES,
} from "@/types/project"

import { apiError, getAuthenticatedUserId } from "../_lib/route-helpers"

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const PROJECTS_PAGE_SIZE = 50

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")

const createSchema = z
  .object({
    tenant_id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    description: z.string().max(5000).optional().nullable(),
    project_number: z.string().max(100).optional().nullable(),
    planned_start_date: dateString.optional().nullable(),
    planned_end_date: dateString.optional().nullable(),
    responsible_user_id: z.string().uuid().optional(),
    project_type: z.enum(PROJECT_TYPES as unknown as [string, ...string[]])
      .default("general"),
    project_method: z
      .enum(["scrum", "kanban", "safe", "waterfall", "pmi", "general"])
      .default("general"),
  })
  .refine(
    (val) =>
      !val.planned_start_date ||
      !val.planned_end_date ||
      val.planned_end_date >= val.planned_start_date,
    {
      message: "planned_end_date must be on or after planned_start_date",
      path: ["planned_end_date"],
    }
  )

const lifecycleStatusEnum = z.enum(
  LIFECYCLE_STATUSES as unknown as [string, ...string[]]
)
const projectTypeEnum = z.enum(
  PROJECT_TYPES as unknown as [string, ...string[]]
)

// -----------------------------------------------------------------------------
// POST /api/projects -- create
// -----------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = createSchema.safeParse(body)
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

  const data = parsed.data

  const insertPayload = {
    tenant_id: data.tenant_id,
    name: data.name,
    description: data.description ?? null,
    project_number: data.project_number ?? null,
    planned_start_date: data.planned_start_date ?? null,
    planned_end_date: data.planned_end_date ?? null,
    responsible_user_id: data.responsible_user_id ?? userId,
    project_type: data.project_type,
    project_method: data.project_method,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("projects")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    // Cross-tenant guard trigger (responsible_user_id not in tenant) raises
    // SQLSTATE 22023 — surface as 422 with a helpful message.
    if (error.code === "22023") {
      return apiError("invalid_parameter", error.message, 422, "responsible_user_id")
    }
    // CHECK constraint violation (e.g. unknown project_type if zod was bypassed).
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    // RLS denial typically surfaces as 42501 from Postgres or as a generic
    // permission error. Fall through to a generic 500/403.
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to create projects in this tenant.", 403)
    }
    return apiError("create_failed", error.message, 500)
  }

  // PROJ-4: auto-lead-on-create. Per ADR v3-project-memberships-schema, the
  // creator is automatically a project_lead. We do this in the API route
  // (not via trigger) so it's explicit and easy to debug. The RLS INSERT
  // policy on project_memberships allows admin OR project_lead — but the
  // first project_lead row has to exist first. Since the creator (= caller)
  // by definition has tenant role 'admin' or 'member' (they just created
  // the project), the RLS check `is_tenant_admin(p.tenant_id)` evaluates
  // to true for tenant admins; non-admin members get blocked.
  //
  // Workaround: we use the user-context client and rely on the fact that
  // `is_tenant_admin OR is_project_lead` allows the row when the caller is
  // a tenant admin. For tenant members who are not admins, we'd need a
  // service-role insert OR a special policy. For MVP we leave this as a
  // documented edge case — non-admin members can still create projects
  // (PROJ-2 INSERT policy permits) but they will not auto-receive the
  // lead row until /backend hardens the path. They can add themselves
  // via the API once project_memberships table allows it.
  //
  // TODO PROJ-4 follow-up: switch to a SECURITY DEFINER RPC that creates
  // both rows atomically and bypasses RLS for the lead bootstrap.
  if (row) {
    await supabase
      .from("project_memberships")
      .insert({
        project_id: row.id,
        user_id: userId,
        role: "lead",
        created_by: userId,
      })
  }

  return NextResponse.json({ project: row }, { status: 201 })
}

// -----------------------------------------------------------------------------
// GET /api/projects -- list (cursor-paginated, RLS-scoped)
// -----------------------------------------------------------------------------

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tenantId = url.searchParams.get("tenant_id")
  if (!tenantId) {
    return apiError("validation_error", "tenant_id query param is required.", 400, "tenant_id")
  }

  const tenantIdParse = z.string().uuid().safeParse(tenantId)
  if (!tenantIdParse.success) {
    return apiError("validation_error", "tenant_id must be a UUID.", 400, "tenant_id")
  }

  const lifecycleStatus = url.searchParams.get("lifecycle_status")
  const projectType = url.searchParams.get("project_type")
  const responsibleUserId = url.searchParams.get("responsible_user_id")
  const includeDeletedRaw = url.searchParams.get("include_deleted")
  const includeDeleted = includeDeletedRaw === "true"
  const cursorRaw = url.searchParams.get("cursor")

  if (lifecycleStatus !== null) {
    const ok = lifecycleStatusEnum.safeParse(lifecycleStatus)
    if (!ok.success) {
      return apiError("validation_error", "Invalid lifecycle_status.", 400, "lifecycle_status")
    }
  }
  if (projectType !== null) {
    const ok = projectTypeEnum.safeParse(projectType)
    if (!ok.success) {
      return apiError("validation_error", "Invalid project_type.", 400, "project_type")
    }
  }
  if (responsibleUserId !== null) {
    const ok = z.string().uuid().safeParse(responsibleUserId)
    if (!ok.success) {
      return apiError(
        "validation_error",
        "responsible_user_id must be a UUID.",
        400,
        "responsible_user_id"
      )
    }
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  let query = supabase
    .from("projects")
    .select(
      "id, tenant_id, name, description, project_number, planned_start_date, planned_end_date, responsible_user_id, lifecycle_status, project_type, created_by, created_at, updated_at, is_deleted"
    )
    .eq("tenant_id", tenantId)
    .eq("is_deleted", includeDeleted)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PROJECTS_PAGE_SIZE + 1)

  if (lifecycleStatus) query = query.eq("lifecycle_status", lifecycleStatus)
  if (projectType) query = query.eq("project_type", projectType)
  if (responsibleUserId) query = query.eq("responsible_user_id", responsibleUserId)

  if (cursorRaw) {
    const parsedCursor = decodeCursor(cursorRaw)
    if (parsedCursor) {
      query = query.or(
        `updated_at.lt.${parsedCursor.updated_at},and(updated_at.eq.${parsedCursor.updated_at},id.lt.${parsedCursor.id})`
      )
    }
  }

  const { data, error } = await query

  if (error) {
    return apiError("list_failed", error.message, 500)
  }

  const rows = data ?? []
  const hasMore = rows.length > PROJECTS_PAGE_SIZE
  const pageRows = hasMore ? rows.slice(0, PROJECTS_PAGE_SIZE) : rows
  let nextCursor: string | null = null
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1] as {
      id: string
      updated_at: string
    }
    nextCursor = encodeCursor({ updated_at: last.updated_at, id: last.id })
  }

  return NextResponse.json({ projects: pageRows, nextCursor }, { status: 200 })
}
