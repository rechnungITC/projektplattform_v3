/**
 * PROJ-88 — stakeholder proposals from a kickoff context source.
 *
 *   POST /api/projects/[id]/ai/stakeholder-proposals
 *     Body: { contextSourceId: uuid, count?: 1–30 (default 10) }
 *     → triggers `invokeStakeholderProposalsGeneration` and returns the
 *       run result + new suggestion ids.
 *
 *   GET  /api/projects/[id]/ai/stakeholder-proposals?status=draft|accepted|rejected
 *     → lists `ki_suggestions` rows with
 *       `purpose='proposal_stakeholders_from_context'`, newest first.
 *
 * Auth: editor+ for POST, member for GET. The purpose is Class-3-PINNED
 * (Tech-Design L1): `classifyStakeholderProposalsAutoContext` returns 3
 * unconditionally, so the router can only resolve local/eligible
 * providers — an editor cannot route stakeholder data to a cloud
 * provider under any circumstances (invariant #3).
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { collectStakeholderProposalsAutoContext } from "@/lib/ai/auto-context"
import { invokeStakeholderProposalsGeneration } from "@/lib/ai/router"
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
  contextSourceId: z.string().uuid(),
  count: z.number().int().min(1).max(30).default(10),
})

interface Ctx {
  params: Promise<{ id: string }>
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
    .eq("purpose", "proposal_stakeholders_from_context")
    .order("created_at", { ascending: false })
    .limit(200)

  if (statusParsed.data) {
    query = query.eq("status", statusParsed.data)
  }

  const { data, error } = await query
  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({ suggestions: data ?? [] }, { status: 200 })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

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

  let context
  try {
    context = await collectStakeholderProposalsAutoContext(
      supabase,
      projectId,
      parsed.data.contextSourceId,
    )
  } catch (err) {
    return apiError(
      "context_failed",
      err instanceof Error ? err.message : "Failed to collect context.",
      500,
    )
  }

  const result = await invokeStakeholderProposalsGeneration({
    supabase,
    tenantId: access.project.tenant_id,
    projectId,
    actorUserId: userId,
    context,
    count: parsed.data.count,
  })

  return NextResponse.json(result, { status: 200 })
}
