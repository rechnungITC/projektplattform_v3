/**
 * PROJ-65 ε.4.β — resource-swap AI proposals (Class-3, Ollama-only, advisory).
 *
 *   POST /api/projects/[id]/ai/resource-swap
 *     Body: { count?: 1–5, default 3 }
 *     → triggers `invokeResourceSwapGeneration`, returns run + new ids.
 *
 *   GET  /api/projects/[id]/ai/resource-swap?status=draft|accepted|rejected
 *     → lists `ki_suggestions` rows with purpose='resource_swap'.
 *
 * Auth: editor+ for POST + GET (project members; the rate-bucketing on
 * the auto-context is the privacy boundary against non-lead callers per
 * CIA Fork 3 — Tagessätze landen nie als €-Klartext im Kontext, wenn der
 * Aufrufer keinen cost_clear_view hat).
 *
 * Class-3 hard-fix lives in the router (`classifyResourceSwapAutoContext`
 * returns 3 konstant); cloud providers are NEVER reached on this code
 * path. Ollama-only routing; Ollama-Error → `external_blocked` (NO Stub
 * fallback) — see CIA-L2 in the migration header.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { collectResourceSwapContext } from "@/lib/ai/auto-context"
import { invokeResourceSwapGeneration } from "@/lib/ai/router"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

const SELECT_COLUMNS =
  "id, tenant_id, project_id, ki_run_id, purpose, payload, original_payload, is_modified, status, accepted_entity_type, accepted_entity_id, rejection_reason, created_by, created_at, updated_at, accepted_at, rejected_at"

const VALID_STATUSES = ["draft", "accepted", "rejected"] as const
const statusSchema = z.enum(VALID_STATUSES).optional()

const postBodySchema = z.object({
  count: z.number().int().min(1).max(5).default(3),
})

interface Ctx {
  params: Promise<{ id: string }>
}

/** Resolve cost-clear-view for the caller from tenant + project role.
 *  Mirrors the RPC gate: tenant_admin OR project lead → cost_clear_view. */
async function resolveCostClearView(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  tenantId: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const [tenantRes, projectRes] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("project_memberships")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
  ])
  const tenantRole = (tenantRes.data as { role?: string } | null)?.role ?? null
  const projectRole = (projectRes.data as { role?: string } | null)?.role ?? null
  return tenantRole === "admin" || projectRole === "lead"
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "ai_proposals",
    { intent: "read" },
  )
  if (moduleDenial) return moduleDenial

  const url = new URL(request.url)
  const statusParsed = statusSchema.safeParse(
    url.searchParams.get("status") ?? undefined,
  )
  if (!statusParsed.success) {
    return apiError("validation_error", "Invalid status filter.", 400, "status")
  }

  let query = supabase
    .from("ki_suggestions")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("purpose", "resource_swap")
    .order("created_at", { ascending: false })
    .limit(100)

  if (statusParsed.data) {
    query = query.eq("status", statusParsed.data)
  }

  const { data, error } = await query
  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({ suggestions: data ?? [] }, { status: 200 })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  let body: unknown = {}
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json()
    } catch {
      body = {}
    }
  }
  const parsed = postBodySchema.safeParse(
    typeof body === "object" && body !== null ? body : {},
  )
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "ai_proposals",
    { intent: "write" },
  )
  if (moduleDenial) return moduleDenial

  // CIA-L3: the auto-context masks daily rates as buckets when the caller
  // does NOT have cost-clear-view (i.e., is not lead/admin). This closes
  // the Cost-Clear-View bypass risk identified in the CIA review.
  const costClearView = await resolveCostClearView(
    supabase,
    access.project.tenant_id,
    projectId,
    userId,
  )

  let context
  try {
    context = await collectResourceSwapContext(supabase, projectId, {
      costClearView,
    })
  } catch (err) {
    return apiError(
      "context_failed",
      err instanceof Error ? err.message : "Failed to collect context.",
      500,
    )
  }

  const result = await invokeResourceSwapGeneration({
    supabase,
    tenantId: access.project.tenant_id,
    projectId,
    actorUserId: userId,
    context,
    count: parsed.data.count,
  })

  return NextResponse.json(result, { status: 200 })
}
