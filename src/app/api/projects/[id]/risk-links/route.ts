/**
 * PROJ-65 ε.3e (F-62) — risk ↔ phase/sprint links.
 *
 * GET  /api/projects/[id]/risk-links?risk_id=…            → links for one risk
 * GET  /api/projects/[id]/risk-links?linked_kind=phase&linked_id=…
 *                                                         → links on one node
 * POST /api/projects/[id]/risk-links { risk_id, linked_kind, linked_id }
 *
 * Backed by the `risk_links` table (polymorphic, INSERT/DELETE-only) created in
 * ε.3c.δ. RLS gates writes to project editor/lead/tenant-admin; the INSERT/DELETE
 * audit triggers (ε.3e) record one `__row__` audit entry per change.
 *
 * Calls go through the user-scoped client so RLS + `auth.uid()` (for audit
 * actor) resolve correctly.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

const SELECT_COLUMNS =
  "id, tenant_id, risk_id, linked_kind, linked_id, created_by, created_at"

interface Ctx {
  params: Promise<{ id: string }>
}

const createSchema = z.object({
  risk_id: z.string().uuid(),
  linked_kind: z.enum(["phase", "sprint"]),
  linked_id: z.string().uuid(),
})

// GET — list links scoped to this project. Either filter is accepted; project
// scope is enforced via an inner join on risks.project_id.
export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const riskId = url.searchParams.get("risk_id")
  const linkedKind = url.searchParams.get("linked_kind")
  const linkedId = url.searchParams.get("linked_id")

  let query = supabase
    .from("risk_links")
    .select(`${SELECT_COLUMNS}, risks!inner(project_id)`)
    .eq("risks.project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(500)

  if (riskId) {
    if (!z.string().uuid().safeParse(riskId).success) {
      return apiError("validation_error", "risk_id must be a UUID.", 400, "risk_id")
    }
    query = query.eq("risk_id", riskId)
  }
  if (linkedKind) {
    if (linkedKind !== "phase" && linkedKind !== "sprint") {
      return apiError("validation_error", "linked_kind must be phase|sprint.", 400, "linked_kind")
    }
    query = query.eq("linked_kind", linkedKind)
  }
  if (linkedId) {
    if (!z.string().uuid().safeParse(linkedId).success) {
      return apiError("validation_error", "linked_id must be a UUID.", 400, "linked_id")
    }
    query = query.eq("linked_id", linkedId)
  }

  const { data, error } = await query
  if (error) return apiError("read_failed", error.message, 500)

  // Strip the embedded join object from the response shape.
  const links = (data ?? []).map((row) => {
    const { risks: _risks, ...rest } = row as Record<string, unknown>
    return rest
  })
  return NextResponse.json({ risk_links: links }, { status: 200 })
}

// POST — create a link. Validates that BOTH the risk and the linked node belong
// to THIS project (prevents cross-project linking within a tenant; the DB trigger
// only enforces tenant boundary, not project).
export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "risks",
    { intent: "write" },
  )
  if (moduleDenial) return moduleDenial

  const { risk_id, linked_kind, linked_id } = parsed.data

  // Verify the risk belongs to this project.
  const { data: risk, error: riskErr } = await supabase
    .from("risks")
    .select("id, project_id")
    .eq("id", risk_id)
    .eq("project_id", projectId)
    .maybeSingle()
  if (riskErr) return apiError("read_failed", riskErr.message, 500)
  if (!risk) return apiError("not_found", "Risk not found in this project.", 404, "risk_id")

  // Verify the linked node belongs to this project.
  const nodeTable = linked_kind === "phase" ? "phases" : "sprints"
  const { data: node, error: nodeErr } = await supabase
    .from(nodeTable)
    .select("id, project_id")
    .eq("id", linked_id)
    .eq("project_id", projectId)
    .maybeSingle()
  if (nodeErr) return apiError("read_failed", nodeErr.message, 500)
  if (!node) return apiError("not_found", `${linked_kind} not found in this project.`, 404, "linked_id")

  const { data, error } = await supabase
    .from("risk_links")
    .insert({
      tenant_id: access.project.tenant_id,
      risk_id,
      linked_kind,
      linked_id,
      created_by: userId,
    })
    .select(SELECT_COLUMNS)
    .maybeSingle()

  if (error) {
    // Unique violation → the link already exists. Treat as idempotent success.
    if (error.code === "23505") {
      return apiError("already_linked", "This risk is already linked to that node.", 409)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to create risk links.", 403)
    }
    return apiError("insert_failed", error.message, 500)
  }

  return NextResponse.json({ risk_link: data }, { status: 201 })
}
