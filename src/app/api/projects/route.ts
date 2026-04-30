import { NextResponse } from "next/server"
import { z } from "zod"

import { applyTriggerForNewTag } from "@/lib/compliance/trigger"
import { resolveProjectTypeProfile } from "@/lib/project-types/overrides"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ProjectTypeOverrideFields } from "@/types/master-data"
import {
  decodeCursor,
  encodeCursor,
  LIFECYCLE_STATUSES,
  PROJECT_TYPES,
  type ProjectType,
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
    // PROJ-18 ST-05: optional list of compliance tag keys the wizard chose
    // to skip from the type's default set. When omitted, all defaults apply.
    skip_default_tag_keys: z.array(z.string()).max(20).optional(),
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

  // PROJ-18 ST-05: apply default compliance tags from the project-type catalog
  // (with tenant override). Implementation: create a "Projektstart & Compliance"
  // root work-item, then attach each default tag — the trigger fires per tag.
  // Skip when the type has no defaults or the wizard deselected everything.
  let appliedTags: string[] = []
  if (row) {
    try {
      const { data: overrideRow } = await supabase
        .from("tenant_project_type_overrides")
        .select("overrides")
        .eq("tenant_id", data.tenant_id)
        .eq("type_key", data.project_type)
        .maybeSingle()
      const override =
        ((overrideRow as { overrides?: ProjectTypeOverrideFields } | null)
          ?.overrides ?? null)
      const profile = resolveProjectTypeProfile(
        data.project_type as ProjectType,
        override
      )
      const skipped = new Set(data.skip_default_tag_keys ?? [])
      const defaultKeys = (profile?.default_tag_keys ?? []).filter(
        (k) => !skipped.has(k)
      )
      if (defaultKeys.length > 0) {
        // Resolve tag-keys to tag rows for this tenant.
        const { data: tagRows } = await supabase
          .from("compliance_tags")
          .select("id, key")
          .eq("tenant_id", data.tenant_id)
          .in("key", defaultKeys)
          .eq("is_active", true)
        const tagsToAttach = (tagRows ?? []) as { id: string; key: string }[]
        if (tagsToAttach.length > 0) {
          // Use the admin client so we can write the work-item + attachments
          // even before the project membership row is propagated through RLS.
          let admin
          try {
            admin = createAdminClient()
          } catch {
            admin = null
          }
          if (admin) {
            const { data: rootWorkItem } = await admin
              .from("work_items")
              .insert({
                tenant_id: data.tenant_id,
                project_id: row.id,
                kind: "work_package",
                parent_id: null,
                title: "Projektstart & Compliance",
                description:
                  "Auto-generierte Wurzel-Aufgabe für die Standard-Compliance-Schritte des Projekttyps. " +
                  "Tags wurden aus dem Typ-Katalog (PROJ-18 ST-05) abgeleitet.",
                status: "todo",
                priority: "medium",
                attributes: { compliance_origin: { reason: "project_default_tags" } },
                created_by: userId,
              })
              .select("id, tenant_id, project_id")
              .single()
            if (rootWorkItem) {
              const root = rootWorkItem as {
                id: string
                tenant_id: string
                project_id: string
              }
              for (const tag of tagsToAttach) {
                const { error: linkErr } = await admin
                  .from("work_item_tags")
                  .insert({
                    tenant_id: root.tenant_id,
                    work_item_id: root.id,
                    tag_id: tag.id,
                    created_by: userId,
                  })
                if (!linkErr) {
                  await applyTriggerForNewTag({
                    supabase: admin,
                    tenantId: root.tenant_id,
                    projectId: root.project_id,
                    workItemId: root.id,
                    tagId: tag.id,
                    userId,
                  }).catch(() => {})
                  appliedTags.push(tag.key)
                }
              }
            }
          }
        }
      }
    } catch {
      // Best-effort — project creation already succeeded.
      appliedTags = []
    }
  }

  return NextResponse.json(
    { project: row, applied_default_tags: appliedTags },
    { status: 201 }
  )
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
