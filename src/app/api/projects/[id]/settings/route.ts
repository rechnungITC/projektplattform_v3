/**
 * PROJ-65 ε.3e (F-64) — project-level Plan-Mutate settings.
 *
 * GET   /api/projects/[id]/settings
 *   → { plan_mutate: { snap_to_week, enabled }, tenant_plan_mutate_enabled,
 *       permissions: { can_toggle_snap, can_toggle_enabled } }
 *
 * PATCH /api/projects/[id]/settings { snap_to_week?, enabled? }
 *   → snap_to_week  via RPC set_project_snap_to_week        (editor/lead/admin)
 *     enabled       via RPC set_project_plan_mutate_enabled (lead/admin only)
 *
 * Writes go through SECURITY DEFINER setter RPCs (called on the user-scoped
 * client so auth.uid() + RBAC resolve). The per-project `enabled` flag can only
 * RESTRICT plan-mutate; the tenant master switch stays authoritative.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

const patchSchema = z
  .object({
    snap_to_week: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.snap_to_week !== undefined || v.enabled !== undefined, {
    message: "At least one of snap_to_week, enabled must be provided.",
  })

interface RpcEnvelope {
  ok: boolean
  status?: number
  error?: string
}

async function resolveRoles(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  tenantId: string,
  projectId: string,
  userId: string,
) {
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
  const isAdmin = tenantRole === "admin"
  const isLead = projectRole === "lead"
  const isEditor = projectRole === "editor"
  return {
    canToggleEnabled: isAdmin || isLead,
    canToggleSnap: isAdmin || isLead || isEditor,
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data: projectRow, error: projErr } = await supabase
    .from("projects")
    .select("settings")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("read_failed", projErr.message, 500)

  const settings =
    (projectRow as { settings?: Record<string, unknown> | null } | null)
      ?.settings ?? {}
  const planMutate = (settings.plan_mutate ?? {}) as Record<string, unknown>

  const { data: tenantRow } = await supabase
    .from("tenant_settings")
    .select("trajectory_plan_mutate_enabled")
    .eq("tenant_id", access.project.tenant_id)
    .maybeSingle()

  const permissions = await resolveRoles(
    supabase,
    access.project.tenant_id,
    projectId,
    userId,
  )

  return NextResponse.json(
    {
      plan_mutate: {
        snap_to_week: planMutate.snap_to_week === true,
        // default-ON: absent or any non-false value ⇒ enabled
        enabled: planMutate.enabled !== false,
      },
      tenant_plan_mutate_enabled:
        (tenantRow as { trajectory_plan_mutate_enabled?: boolean | null } | null)
          ?.trajectory_plan_mutate_enabled === true,
      permissions,
    },
    { status: 200 },
  )
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // 404 / cross-tenant short-circuit. Per-field RBAC is enforced by the RPCs.
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // Apply enabled (lead/admin) first, then snap_to_week (editor+). Each RPC
  // self-authorizes and returns an envelope; surface the first failure.
  if (parsed.data.enabled !== undefined) {
    const { data, error } = await supabase.rpc("set_project_plan_mutate_enabled", {
      p_project_id: projectId,
      p_enabled: parsed.data.enabled,
    })
    if (error) return apiError("rpc_failed", error.message, 500)
    const env = data as RpcEnvelope | null
    if (!env?.ok) {
      const status = typeof env?.status === "number" && env.status >= 400 ? env.status : 500
      return NextResponse.json(env ?? { ok: false }, { status })
    }
  }

  if (parsed.data.snap_to_week !== undefined) {
    const { data, error } = await supabase.rpc("set_project_snap_to_week", {
      p_project_id: projectId,
      p_enabled: parsed.data.snap_to_week,
    })
    if (error) return apiError("rpc_failed", error.message, 500)
    const env = data as RpcEnvelope | null
    if (!env?.ok) {
      const status = typeof env?.status === "number" && env.status >= 400 ? env.status : 500
      return NextResponse.json(env ?? { ok: false }, { status })
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
