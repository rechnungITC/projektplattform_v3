import { after, NextResponse } from "next/server"
import { z } from "zod"

import { synthesizeResourceAllocationCostLines } from "@/lib/cost"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../_lib/route-helpers"
import { normalizeResourcePayload, resourcePatchSchema as patchSchema } from "../_schema"

// PROJ-11 — single-resource endpoints.
// GET    /api/resources/[rid]
// PATCH  /api/resources/[rid]
// DELETE /api/resources/[rid]

// PROJ-54-α — Override-Spalten in der Antwort exposed (s. Hinweis im
// `route.ts` der Collection).
const SELECT_COLUMNS =
  "id, tenant_id, source_stakeholder_id, linked_user_id, display_name, kind, fte_default, availability_default, is_active, daily_rate_override, daily_rate_override_currency, recompute_status, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ rid: string }>
}

async function loadResource(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  resourceId: string
) {
  return supabase
    .from("resources")
    .select(SELECT_COLUMNS)
    .eq("id", resourceId)
    .maybeSingle()
}

export async function GET(_request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await loadResource(supabase, rid)
  if (error) return apiError("read_failed", error.message, 500)
  if (!data) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    data.tenant_id as string,
    "resources",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  return NextResponse.json({ resource: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
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
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: existing, error: existingErr } = await loadResource(supabase, rid)
  if (existingErr) return apiError("read_failed", existingErr.message, 500)
  if (!existing) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    existing.tenant_id as string,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // PROJ-54-β — Optimistic Lock.
  // BUG-3 fix (2026-05-09): we use a CUSTOM header `X-If-Unmodified-Since`
  // instead of the standard `If-Unmodified-Since`. The standard header
  // is intercepted by Vercel/Next.js's edge layer (RFC-7232 §3.4) and
  // returns 412 BEFORE this handler runs — blocking every save the
  // user attempts. Switching to a custom header bypasses all HTTP
  // protocol-level precondition semantics; only this server enforces
  // it, and only with our own 409 stale_record response.
  // For backwards-compat we still read the standard header if present
  // (no in-flight clients should be sending it after the same-version
  // ship of route + lib, but defense-in-depth never hurts).
  const ifUnmod =
    request.headers.get("x-if-unmodified-since") ??
    request.headers.get("if-unmodified-since")
  if (ifUnmod) {
    const headerMs = Date.parse(ifUnmod)
    const dbMs = Date.parse(existing.updated_at as string)
    if (Number.isFinite(headerMs) && Number.isFinite(dbMs) && dbMs > headerMs) {
      return apiError(
        "stale_record",
        "Die Ressource wurde inzwischen geändert. Lade die Seite neu und versuche es erneut.",
        409
      )
    }
  }

  // PROJ-54-α — Override-Spalten dürfen nur von Tenant-Admins geschrieben
  // werden. Wir prüfen, ob die Felder im Payload sind (egal ob Wert oder
  // explizit `null` zum Löschen) und gaten admin-only.
  const touchesOverride =
    Object.prototype.hasOwnProperty.call(parsed.data, "daily_rate_override") ||
    Object.prototype.hasOwnProperty.call(
      parsed.data,
      "daily_rate_override_currency"
    )
  if (touchesOverride) {
    const tenantId = existing.tenant_id as string
    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle()
    const role = (membership as { role?: string } | null)?.role
    if (role !== "admin") {
      return apiError(
        "forbidden",
        "Tenant-Admin-Rolle erforderlich, um den Tagessatz-Override zu ändern.",
        403
      )
    }
  }

  // PROJ-54-γ — when the override changes, mark the row as recompute
  // pending in the same UPDATE so a concurrent reader sees the
  // intent-to-recompute immediately. The actual cost-line synthesis
  // runs after the response via after().
  const overrideChanged =
    touchesOverride &&
    (parsed.data.daily_rate_override !== existing.daily_rate_override ||
      parsed.data.daily_rate_override_currency !==
        existing.daily_rate_override_currency)

  // Spread-Pattern: schema is the single source of truth.
  const update: Record<string, unknown> = normalizeResourcePayload(parsed.data)
  if (overrideChanged) {
    update.recompute_status = "pending"
  }

  const { data: row, error } = await supabase
    .from("resources")
    .update(update)
    .eq("id", rid)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("forbidden", "Editor or admin role required.", 403)
    }
    if (error.code === "23505") {
      return apiError(
        "duplicate",
        "Another resource is already linked to this user.",
        409
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }

  // PROJ-54-γ — Async cost-line recompute after the response.
  // `after()` throws outside a Next.js request scope (e.g. unit tests
  // calling the handler directly). Wrap so the response always wins.
  if (overrideChanged) {
    const tenantId = existing.tenant_id as string
    try {
      after(async () => {
        try {
          await recomputeCostLinesForResource(tenantId, rid, userId)
        } catch (err) {
          // recomputeCostLinesForResource handles its own errors and
          // sets recompute_status='failed' on the row. This catch is a
          // belt-and-braces guard so the after() worker never throws.
          console.error(
            `[PROJ-54-γ] after() recompute crashed for resource ${rid}: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
      })
    } catch (err) {
      // Outside a Next.js request scope (unit tests). The PATCH
      // response still goes back to the caller; the recompute simply
      // doesn't run in this code path.
      console.warn(
        `[PROJ-54-γ] after() unavailable, recompute skipped: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  return NextResponse.json({ resource: row })
}

/**
 * PROJ-54-γ — recompute every work-item that has an open allocation
 * referencing this resource, then flip `recompute_status` to either
 * `null` (idle) on success or `'failed'` on any error.
 *
 * Runs via Next.js `after()` after the PATCH response is sent. Uses
 * the service-role admin client so it can write `recompute_status`
 * without an RLS round-trip and so the synthesizer (which also needs
 * service-role) doesn't have to re-derive a separate client.
 */
async function recomputeCostLinesForResource(
  tenantId: string,
  resourceId: string,
  actorUserId: string
): Promise<void> {
  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    // Service-role key missing in env. Mark the row failed via the
    // user's own RLS-scoped session would be ideal, but we're already
    // past the response — swallow + log so the function returns.
    console.error(
      `[PROJ-54-γ] cost-line recompute skipped (admin client init failed): ${
        err instanceof Error ? err.message : String(err)
      }`
    )
    return
  }

  // Mark running (best-effort — if this fails, the synthesize loop
  // still runs).
  await admin
    .from("resources")
    .update({ recompute_status: "running" })
    .eq("id", resourceId)

  // Find every work-item that has a (non-deleted) allocation referencing
  // this resource. The tenant filter is implicit via the resource_id +
  // work_item_resources.tenant_id, but we double-check with a tenant_id
  // predicate as defense-in-depth.
  const { data: allocs, error: allocErr } = await admin
    .from("work_item_resources")
    .select("project_id, work_item_id")
    .eq("resource_id", resourceId)
    .eq("tenant_id", tenantId)

  if (allocErr) {
    console.error(
      `[PROJ-54-γ] failed to load allocations for resource ${resourceId}: ${allocErr.message}`
    )
    await admin
      .from("resources")
      .update({ recompute_status: "failed" })
      .eq("id", resourceId)
    return
  }

  type AllocRow = { project_id: string; work_item_id: string }
  const rows = (allocs ?? []) as AllocRow[]
  // De-duplicate by (project_id, work_item_id) — multiple allocations
  // per work-item are possible (different responsibilities).
  const seen = new Set<string>()
  const targets: AllocRow[] = []
  for (const r of rows) {
    const k = `${r.project_id}::${r.work_item_id}`
    if (!seen.has(k)) {
      seen.add(k)
      targets.push(r)
    }
  }

  let anyFailed = false
  for (const t of targets) {
    try {
      const result = await synthesizeResourceAllocationCostLines({
        adminClient: admin,
        tenantId,
        projectId: t.project_id,
        workItemId: t.work_item_id,
        actorUserId,
      })
      // The synthesizer is FAIL-OPEN — it never throws but it does
      // surface errors via `hadCostCalcError`. Treat that as a γ-fail.
      if (
        result &&
        typeof result === "object" &&
        "hadCostCalcError" in result &&
        (result as { hadCostCalcError?: boolean }).hadCostCalcError === true
      ) {
        anyFailed = true
      }
    } catch (err) {
      anyFailed = true
      console.error(
        `[PROJ-54-γ] synthesize failed for work-item ${t.work_item_id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  await admin
    .from("resources")
    .update({ recompute_status: anyFailed ? "failed" : null })
    .eq("id", resourceId)
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: existing, error: existingErr } = await loadResource(supabase, rid)
  if (existingErr) return apiError("read_failed", existingErr.message, 500)
  if (!existing) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    existing.tenant_id as string,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { error } = await supabase
    .from("resources")
    .delete()
    .eq("id", rid)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Admin role required to delete resources.", 403)
    }
    if (error.code === "23503") {
      return apiError(
        "in_use",
        "Resource is allocated to work items. Deactivate it instead.",
        409
      )
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
