/**
 * PROJ-65 ε.3c.β — POST /api/projects/[id]/plan-mutate
 *
 * Atomic Plan-Mutate over the trajectory graph.
 *
 * Backwards-compatible: accepts EITHER
 *   (a) legacy single-source body { source_node_id, source_node_kind, intent, if_updated_at }
 *       → dispatches to RPC `plan_mutate_atomic` (5-arg)
 *   (b) new bulk body            { sources: [{node_id, node_kind}, ...], intent, if_updated_at }
 *       → dispatches to RPC `plan_mutate_atomic_bulk` (4-arg)
 *
 * Both RPCs return the same envelope shape with a top-level `status` mapped
 * to HTTP. New 422 error codes in bulk:
 *   - source_node_lock_missing (with missing_sources payload)
 *   - sources_required, invalid_source_entry, unsupported_source_node_kind
 * Cycle responses may carry `cycle.source_node_id` (multi-source attribution).
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

const intentSchema = z.object({
  kind: z.literal("shift_dates"),
  days: z.number().int(),
})

const singleSourceSchema = z.object({
  source_node_id: z.string().uuid(),
  source_node_kind: z.enum(["sprint", "phase"]),
  intent: intentSchema,
  if_updated_at: z.array(lockEntrySchema).max(500),
})

const bulkSchema = z.object({
  sources: z
    .array(
      z.object({
        node_id: z.string().uuid(),
        node_kind: z.enum(["sprint", "phase"]),
      }),
    )
    .min(1)
    .max(50),
  intent: intentSchema,
  if_updated_at: z.array(lockEntrySchema).max(500),
})

const bodySchema = z.union([bulkSchema, singleSourceSchema])

interface RpcEnvelope {
  ok: boolean
  status?: number
  error?: string
  hint?: string
  causation_id?: string
  diff?: { affected: unknown[] }
  conflict?: {
    conflicted_node_ids: string[]
    current_snapshot_hint: Record<string, unknown>
  }
  cycle?: {
    detected_at_node_id: string
    path: string[]
    source_node_id?: string
  }
  missing_sources?: Array<{ node_id: string; node_kind: string }>
}

function hasSourcesField(value: unknown): value is { sources: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "sources" in (value as Record<string, unknown>)
  )
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

  const adminClient = createAdminClient()

  // Dispatch based on body shape. `bulkSchema` matches when `sources` is
  // present; otherwise legacy single-source.
  const isBulk = hasSourcesField(parsed.data)

  const { data, error } = isBulk
    ? await adminClient.rpc("plan_mutate_atomic_bulk", {
        p_project_id: projectId,
        p_sources: (parsed.data as z.infer<typeof bulkSchema>).sources,
        p_intent: parsed.data.intent,
        p_if_updated_at: parsed.data.if_updated_at,
      })
    : await adminClient.rpc("plan_mutate_atomic", {
        p_project_id: projectId,
        p_source_node_id: (parsed.data as z.infer<typeof singleSourceSchema>)
          .source_node_id,
        p_source_node_kind: (parsed.data as z.infer<typeof singleSourceSchema>)
          .source_node_kind,
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
