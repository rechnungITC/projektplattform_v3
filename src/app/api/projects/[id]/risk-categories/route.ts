import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

import { RISK_CATEGORY_SELECT } from "../../../risk-categories/_schema"

// PROJ-107 — project-scoped risk-category list (the risk-form data source).
//
// GET /api/projects/[id]/risk-categories
//   - any project member (view access)
//   - for M&A projects, lazily seeds the tenant's DD standard set on first use
//     (idempotent, copy-on-first-use — CIA Fork A "A2-lite")
//   - returns active categories applicable to the project's type
//     (applies_to_project_type null = all types)

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // Fetch the project type (drives lazy-seed + applicability filter).
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .select("project_type")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("read_failed", projErr.message, 500)
  const projectType = (proj?.project_type as string | undefined) ?? null

  // Lazy-seed the M&A DD standard set on first use (idempotent, member-gated).
  if (projectType === "ma") {
    const { error: seedErr } = await supabase.rpc(
      "seed_risk_categories_if_empty",
      { p_tenant_id: access.project.tenant_id }
    )
    // Non-fatal: a seed race or a non-admin without insert is fine — the list
    // below still returns whatever categories already exist for the tenant.
    if (seedErr && seedErr.code !== "42501") {
      // swallow: seeding is best-effort; listing must still succeed
    }
  }

  const { data, error } = await supabase
    .from("risk_categories")
    .select(RISK_CATEGORY_SELECT)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)

  const categories = (data ?? []).filter((c) => {
    const applies = (c as { applies_to_project_type: string | null })
      .applies_to_project_type
    return applies === null || applies === projectType
  })

  return NextResponse.json({ categories })
}
