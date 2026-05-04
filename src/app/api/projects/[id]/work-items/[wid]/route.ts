import { NextResponse } from "next/server"
import { z } from "zod"

import { synthesizeResourceAllocationCostLines } from "@/lib/cost"
import { createAdminClient } from "@/lib/supabase/admin"
import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import {
  ALLOWED_PARENT_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"
import type { ProjectMethod } from "@/types/project-method"

import { workItemPatchSchema as updateSchema } from "../_schema"

// PATCH master data: NOT status (use /status), NOT parent_id (use /parent).
// `kind` is allowed here (admin re-classification — see ChangeKindDialog).
// Schema lives in `../_schema.ts` so the drift-test can introspect it.

function validateIds(projectId: string, workItemId: string) {
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(workItemId).success) {
    return apiError("validation_error", "Invalid work item id.", 400, "wid")
  }
  return null
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/work-items/[wid]  --  detail
// -----------------------------------------------------------------------------
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  const idErr = validateIds(projectId, workItemId)
  if (idErr) return idErr

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("work_items")
    .select("*")
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)
  if (!data) return apiError("not_found", "Work item not found.", 404)
  return NextResponse.json({ work_item: data })
}

// -----------------------------------------------------------------------------
// PATCH /api/projects/[id]/work-items/[wid]  --  update master data
// -----------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  const idErr = validateIds(projectId, workItemId)
  if (idErr) return idErr

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = updateSchema.safeParse(body)
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

  // PROJ-24 Phase δ — capture pre-update cost-driver state to decide whether
  // the cost-line hook needs to fire after the UPDATE. We pull `attributes`
  // (for story_points + estimated_duration_days) and `kind` only if any of
  // those would be modified — otherwise we don't pay for the read.
  const willTouchCostDrivers =
    parsed.data.kind !== undefined || parsed.data.attributes !== undefined
  let preUpdateCostDrivers: {
    kind: string
    storyPoints: unknown
    duration: unknown
    tenantId: string
  } | null = null
  if (willTouchCostDrivers) {
    const { data: pre, error: preErr } = await supabase
      .from("work_items")
      .select("kind, attributes, tenant_id")
      .eq("id", workItemId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (preErr) return apiError("internal_error", preErr.message, 500)
    if (pre) {
      const attrs = (pre as { attributes?: Record<string, unknown> | null }).attributes ?? {}
      preUpdateCostDrivers = {
        kind: (pre as { kind: string }).kind,
        storyPoints: attrs.story_points,
        duration: attrs.estimated_duration_days,
        tenantId: (pre as { tenant_id: string }).tenant_id,
      }
    }
  }

  // If kind is changing, validate against project method + existing parent.
  if (parsed.data.kind) {
    const { data: current, error: currentErr } = await supabase
      .from("work_items")
      .select("id, parent_id, project_id")
      .eq("id", workItemId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (currentErr) return apiError("internal_error", currentErr.message, 500)
    if (!current) return apiError("not_found", "Work item not found.", 404)

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("project_method")
      .eq("id", projectId)
      .maybeSingle()
    if (projErr) return apiError("internal_error", projErr.message, 500)
    const method =
      (project as { project_method?: ProjectMethod | null } | null)
        ?.project_method ?? null

    // Method=null means "no method chosen yet" — every kind is creatable.
    if (
      method !== null &&
      !WORK_ITEM_METHOD_VISIBILITY[parsed.data.kind as WorkItemKind].includes(method)
    ) {
      return apiError(
        "method_violation",
        `Kind '${parsed.data.kind}' is not visible in method '${method}'.`,
        422,
        "kind"
      )
    }

    const newKind = parsed.data.kind as WorkItemKind
    if (current.parent_id) {
      const { data: parent } = await supabase
        .from("work_items")
        .select("kind")
        .eq("id", current.parent_id)
        .maybeSingle()
      const parentKind = (parent as { kind?: WorkItemKind } | null)?.kind ?? null
      if (parentKind && !ALLOWED_PARENT_KINDS[newKind].includes(parentKind)) {
        return apiError(
          "invalid_parent_kind",
          `${newKind} cannot have a ${parentKind} parent. Reassign parent first.`,
          422,
          "kind"
        )
      }
    } else if (!ALLOWED_PARENT_KINDS[newKind].includes(null)) {
      return apiError(
        "invalid_parent_kind",
        `${newKind} requires a parent — assign one first.`,
        422,
        "kind"
      )
    }
  }

  // PROJ-36 Phase 36-α — WBS-Code semantics:
  //   1. body has wbs_code (string)        → user override; force is_custom=true.
  //   2. body has wbs_code_is_custom=false  → reset-to-auto; null out wbs_code so
  //      the autogen trigger regenerates from outline_path on the next UPDATE.
  //   3. otherwise: passthrough.
  const updatePayload: Record<string, unknown> = { ...parsed.data }
  const hasWbsCode = "wbs_code" in parsed.data
  const hasWbsCustomFlag = "wbs_code_is_custom" in parsed.data
  if (hasWbsCode && parsed.data.wbs_code != null) {
    updatePayload.wbs_code_is_custom = true
  } else if (
    hasWbsCustomFlag &&
    parsed.data.wbs_code_is_custom === false &&
    !hasWbsCode
  ) {
    // Reset-to-auto: null wbs_code so the trigger picks it up.
    updatePayload.wbs_code = null
  }

  const { data, error } = await supabase
    .from("work_items")
    .update(updatePayload)
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .select()
    .single()

  if (error) {
    if (error.code === "PGRST116") return apiError("not_found", "Work item not found.", 404)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    if (error.code === "23505") {
      // PROJ-36 Phase 36-α — partial UNIQUE index on
      // (project_id, parent_id, wbs_code) collides with a sibling.
      return apiError(
        "wbs_code_conflict",
        "Dieser WBS-Code wird bereits von einem Geschwister-Element verwendet.",
        422,
        "wbs_code"
      )
    }
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }

  // PROJ-24 Phase δ — if any cost-driver attribute (story_points,
  // estimated_duration_days) or `kind` semantically changed, refresh the
  // resource_allocation cost-lines (Replace-on-Update). FAIL-OPEN — never
  // throws, never alters the response.
  if (preUpdateCostDrivers) {
    const updatedRow = data as {
      kind?: string
      attributes?: Record<string, unknown> | null
      tenant_id?: string
    } | null
    const newAttrs = (updatedRow?.attributes ?? {}) as Record<string, unknown>
    const newKind = updatedRow?.kind ?? preUpdateCostDrivers.kind
    const newSp = newAttrs.story_points
    const newDur = newAttrs.estimated_duration_days
    const driverChanged =
      newKind !== preUpdateCostDrivers.kind ||
      newSp !== preUpdateCostDrivers.storyPoints ||
      newDur !== preUpdateCostDrivers.duration
    if (driverChanged) {
      try {
        const adminClient = createAdminClient()
        await synthesizeResourceAllocationCostLines({
          adminClient,
          tenantId: updatedRow?.tenant_id ?? preUpdateCostDrivers.tenantId,
          projectId,
          workItemId,
          actorUserId: userId,
        })
      } catch (err) {
        console.error(
          `[PROJ-24] cost-line synthesis skipped (work-item PATCH) for work_item=${workItemId}: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
    }
  }

  return NextResponse.json({ work_item: data })
}

// -----------------------------------------------------------------------------
// DELETE /api/projects/[id]/work-items/[wid]
//   default: soft delete (is_deleted = true) — editor or lead via RLS
//   ?hard=true: hard delete — lead/admin only via service-role client
// -----------------------------------------------------------------------------
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const { id: projectId, wid: workItemId } = await context.params
  const idErr = validateIds(projectId, workItemId)
  if (idErr) return idErr

  const url = new URL(request.url)
  const hard = url.searchParams.get("hard") === "true"

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  if (hard) {
    // Hard delete: must be tenant_admin or project_lead. RLS enforces this
    // on the DELETE policy, so we surface the lookup + then issue the
    // delete via the user-context client. Use the service-role client only
    // if the surface RLS denial is a problem; here RLS is sufficient.
    const { data: existing, error: lookupErr } = await supabase
      .from("work_items")
      .select("id, tenant_id")
      .eq("id", workItemId)
      .eq("project_id", projectId)
      .maybeSingle()
    if (lookupErr) return apiError("internal_error", lookupErr.message, 500)
    if (!existing) return apiError("not_found", "Work item not found.", 404)

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

    // We still want the lead/admin gate. The user-context client is the
    // authoritative permission check (RLS DELETE policy). We try it first;
    // only delete via admin once we know the user could have done it.
    const { error: rlsCheckErr } = await supabase
      .from("work_items")
      .delete()
      .eq("id", workItemId)
      .eq("project_id", projectId)
    if (rlsCheckErr) {
      if (rlsCheckErr.code === "42501") {
        return apiError("forbidden", "Not allowed to hard-delete this item.", 403)
      }
      return apiError("delete_failed", rlsCheckErr.message, 500)
    }
    // The user-context delete already removed the row; the admin client is
    // unused but kept for consistency with other hard-delete routes.
    void admin
    return new NextResponse(null, { status: 204 })
  }

  // Soft delete (default).
  const { data, error } = await supabase
    .from("work_items")
    .update({ is_deleted: true })
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle()
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Work item not found.", 404)
  return new NextResponse(null, { status: 204 })
}
