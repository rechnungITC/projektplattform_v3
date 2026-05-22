/**
 * PROJ-65 ε.3b — POST /api/projects/[id]/plan-mutate
 *
 * Atomic Plan-Mutate over the trajectory graph. Routes the
 * authenticated request to the SECURITY DEFINER PL/pgSQL function
 * `plan_mutate_atomic` which performs:
 *   - RBAC + feature-flag gate (L22)
 *   - Forward-BFS cycle detection (L24, R-C2)
 *   - Optimistic-lock check via `if_updated_at` (R-H1)
 *   - Bulk UPDATE via UNNEST (R-H3)
 *   - Class-3 cost masking (R-C1)
 *   - Audit causation_id grouping for Single-Step Undo (L23, R-H2)
 *
 * The RPC returns a JSON envelope with a top-level `status` field
 * that this route maps to HTTP status codes:
 *   200 → { ok: true, causation_id, diff }
 *   401 → unauthenticated
 *   403 → forbidden / feature_disabled
 *   404 → project_not_found
 *   409 → conflict (concurrent edit detected)
 *   422 → cycle | unsupported_intent_kind | unsupported_source_node_kind
 *   5xx → unexpected RPC failure
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

interface RouteContext {
  params: Promise<{ id: string }>
}

const lockEntrySchema = z.object({
  node_id: z.string().uuid(),
  node_kind: z.string().min(1).max(40),
  updated_at: z.string().min(1),
})

const bodySchema = z.object({
  source_node_id: z.string().uuid(),
  source_node_kind: z.enum(["sprint", "phase"]),
  intent: z.object({
    kind: z.literal("shift_dates"),
    days: z.number().int(),
  }),
  if_updated_at: z.array(lockEntrySchema).max(500),
})

interface RpcEnvelope {
  ok: boolean
  status?: number
  error?: string
  causation_id?: string
  diff?: { affected: unknown[] }
  conflict?: {
    conflicted_node_ids: string[]
    current_snapshot_hint: Record<string, unknown>
  }
  cycle?: { detected_at_node_id: string; path: string[] }
}

export async function POST(request: Request, context: RouteContext) {
  const { id: projectId } = await context.params

  const idCheck = z.string().uuid().safeParse(projectId)
  if (!idCheck.success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // 404 / cross-tenant short-circuit + cheap deny path before hitting the RPC.
  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "edit",
  )
  if (access.error) return access.error

  // Use admin client for the RPC call so SECURITY DEFINER can resolve
  // auth.uid() via the JWT we forward. The RPC re-checks tenant + role.
  const adminClient = createAdminClient()
  const { data, error } = await adminClient.rpc("plan_mutate_atomic", {
    p_project_id: projectId,
    p_source_node_id: parsed.data.source_node_id,
    p_source_node_kind: parsed.data.source_node_kind,
    p_intent: parsed.data.intent,
    p_if_updated_at: parsed.data.if_updated_at,
  })

  if (error) {
    return apiError("rpc_failed", error.message, 500)
  }

  const envelope = data as RpcEnvelope | null
  if (!envelope) {
    return apiError("rpc_failed", "Empty RPC response.", 500)
  }

  if (envelope.ok) {
    return NextResponse.json(envelope, { status: 200 })
  }

  // Map RPC-reported status back to HTTP. Defaults to 500 to surface
  // unexpected statuses as server-errors rather than silently 200ing.
  const httpStatus =
    typeof envelope.status === "number" && envelope.status >= 400
      ? envelope.status
      : 500

  return NextResponse.json(envelope, { status: httpStatus })
}
