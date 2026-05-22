/**
 * PROJ-65 ε.3b — POST /api/projects/[id]/plan-mutate/undo
 *
 * Single-Step Undo of a previous plan_mutate_atomic run, identified
 * by `causation_id`. Calls the SECURITY DEFINER PL/pgSQL function
 * `plan_mutate_undo_atomic` which re-checks updated_at per row →
 * 409 on concurrent edit (R-H1).
 *
 * HTTP status mapping mirrors the apply route.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

interface RouteContext {
  params: Promise<{ id: string }>
}

const bodySchema = z.object({
  causation_id: z.string().uuid(),
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

  const access = await requireProjectAccess(
    supabase,
    projectId,
    userId,
    "edit",
  )
  if (access.error) return access.error

  const adminClient = createAdminClient()
  const { data, error } = await adminClient.rpc("plan_mutate_undo_atomic", {
    p_project_id: projectId,
    p_causation_id: parsed.data.causation_id,
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

  const httpStatus =
    typeof envelope.status === "number" && envelope.status >= 400
      ? envelope.status
      : 500

  return NextResponse.json(envelope, { status: httpStatus })
}
