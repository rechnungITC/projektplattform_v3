import { NextResponse } from "next/server"
import { z } from "zod"

import {
  decodeCursor,
  encodeCursor,
  LIFECYCLE_STATUSES,
  PROJECT_TYPES,
} from "@/types/project"
import { PROJECT_METHODS } from "@/types/project-method"

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
    // PROJ-6: method is optional and nullable. NULL = "no method chosen yet".
    // Once set, the DB trigger `enforce_method_immutable` blocks changes.
    project_method: z
      .enum(PROJECT_METHODS as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    // PROJ-6: optional sub-project parent. Cross-tenant guard + depth-2 +
    // self-parent guard are enforced by triggers; surface 422 on violation.
    parent_project_id: z.string().uuid().optional().nullable(),
    // PROJ-5: type-specific extras from the wizard's Step 4. Stored as JSONB.
    // The wizard sends this; per-type extension tables (PROJ-15) can later
    // extract data from this column.
    type_specific_data: z.record(z.string(), z.string()).optional().nullable(),
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
    project_method: data.project_method ?? null,
    parent_project_id: data.parent_project_id ?? null,
    type_specific_data: data.type_specific_data ?? {},
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("projects")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    // 22023 covers multiple guards: responsible_user cross-tenant,
    // sub-project cross-tenant / depth / self-parent. Route the error to
    // the right field by message content for cleaner client UX.
    if (error.code === "22023") {
      const msg = error.message.toLowerCase()
      if (msg.includes("sub-project") || msg.includes("hierarchy") || msg.includes("parent")) {
        return apiError("invalid_parameter", error.message, 422, "parent_project_id")
      }
      return apiError("invalid_parameter", error.message, 422, "responsible_user_id")
    }
    if (error.code === "23503") {
      // FK violation — most likely parent_project_id pointing nowhere.
      const msg = error.message.toLowerCase()
      if (msg.includes("parent")) {
        return apiError("invalid_parameter", error.message, 422, "parent_project_id")
      }
      return apiError("invalid_parameter", error.message, 422)
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

  // PROJ-4: auto-lead-on-create. The creator becomes project_lead via the
  // SECURITY DEFINER `bootstrap_project_lead` RPC. The RPC enforces:
  // caller = p_user_id, project exists, caller is a tenant member, and no
  // memberships exist yet on the project. This bypasses the RLS chicken-
  // and-egg (`is_tenant_admin OR is_project_lead`) for non-admin creators.
  if (row) {
    const { error: bootstrapError } = await supabase.rpc(
      "bootstrap_project_lead",
      { p_project_id: row.id, p_user_id: userId }
    )
    if (bootstrapError) {
      // The project insert succeeded; bootstrap is best-effort. We do not
      // roll back the project, but we surface a 500 so the caller knows
      // the auto-lead step failed and can be re-run via POST /members.
      return apiError(
        "bootstrap_failed",
        `Project created (${row.id}) but auto-lead bootstrap failed: ${bootstrapError.message}`,
        500
      )
    }
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
