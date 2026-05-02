import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { writeCostAuditEntry } from "@/app/api/_lib/cost-audit"
import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

// PROJ-24 ST-07 — work-item cost-lines list/create.
// GET  /api/projects/[id]/work-items/[wid]/cost-lines  — alle Cost-Lines eines Items.
// POST /api/projects/[id]/work-items/[wid]/cost-lines  — manuelle Cost-Line (`source_type='manual'`).
//
// Auth strategy:
//   - GET: project-member via RLS. We still resolve the project up front so
//     that cross-project / cross-tenant access yields a clean 404 instead of
//     leaking existence of foreign work_items via empty-list responses.
//   - POST: project-editor / project-lead / tenant-admin via
//     `requireProjectAccess(...,"edit")`. RLS enforces the same predicate as
//     defense in depth (see `work_item_cost_lines_insert_editor`).
//
// Audit strategy:
//   - INSERT: synthetic audit row via `writeCostAuditEntry` (service-role).
//     PROJ-10 audit triggers only fire on UPDATE.
//   - UPDATE on manual lines is reserved for a future PATCH endpoint; the
//     PROJ-10 trigger will catch those automatically when added.
//
// `source_type` is hardcoded to `'manual'` here. The engine path
// (`source_type='resource_allocation'`) writes its own cost-lines via the
// service-role admin client from the PROJ-11 resources route in phase 24-δ —
// **not** through this user-facing endpoint.
//
// `source_metadata` is restricted to ≤ 4 KB serialized to defend against
// JSONB bloat (free-text notes can drift into multi-MB territory). Class-3
// per `data-privacy-registry` — never sent to external models.

// ⚠️ Currency whitelist: we use `SUPPORTED_CURRENCIES` from
// `@/types/tenant-settings` (the project-wide single source of truth, also
// used by PROJ-22 budget-postings). DO NOT hardcode here.
const SOURCE_METADATA_MAX_BYTES = 4096

const createSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required")
    .optional(),
  source_metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine(
      (v) =>
        v === undefined ||
        JSON.stringify(v).length <= SOURCE_METADATA_MAX_BYTES,
      `source_metadata must be ≤ ${SOURCE_METADATA_MAX_BYTES} bytes serialized.`
    ),
})

interface Ctx {
  params: Promise<{ id: string; wid: string }>
}

// GET /api/projects/[id]/work-items/[wid]/cost-lines
export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, wid } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(wid).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // RLS-equivalent check that surfaces 404 on cross-project access (no
  // existence leak via empty list).
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("work_item_cost_lines")
    .select("*")
    .eq("project_id", projectId)
    .eq("work_item_id", wid)
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ cost_lines: data ?? [] })
}

// POST /api/projects/[id]/work-items/[wid]/cost-lines
export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId, wid } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(wid).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
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

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Verify the work item belongs to this project (FK + RLS would catch it,
  // but a clean 404 is better UX than a generic 42501).
  const { data: wi, error: wiErr } = await supabase
    .from("work_items")
    .select("id, project_id")
    .eq("id", wid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (wiErr) return apiError("read_failed", wiErr.message, 500)
  if (!wi) return apiError("not_found", "Work item not found.", 404)

  const { data: row, error: insertErr } = await supabase
    .from("work_item_cost_lines")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      work_item_id: wid,
      source_type: "manual",
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      occurred_on: parsed.data.occurred_on ?? null,
      source_ref_id: null,
      source_metadata: parsed.data.source_metadata ?? {},
      created_by: userId,
    })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === "42501") {
      return apiError("forbidden", "Editor or lead role required.", 403)
    }
    if (insertErr.code === "23514") {
      return apiError("constraint_violation", insertErr.message, 422)
    }
    if (insertErr.code === "23503") {
      return apiError("invalid_reference", insertErr.message, 422)
    }
    return apiError("create_failed", insertErr.message, 500)
  }

  // Synthetic INSERT audit (best-effort — never blocks the response).
  await writeCostAuditEntry({
    tenantId: access.project.tenant_id,
    entity: "work_item_cost_lines",
    entityId: row.id,
    action: "insert",
    oldValue: null,
    newValue: {
      source_type: "manual",
      amount: row.amount,
      currency: row.currency,
      occurred_on: row.occurred_on,
    },
    actorUserId: userId,
    reason: "Manuelle Cost-Line angelegt",
  })

  return NextResponse.json({ cost_line: row }, { status: 201 })
}
