import { NextResponse } from "next/server"
import { z } from "zod"

import { AUDIT_ENTITY_TYPES, type AuditEntityType } from "@/types/audit"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-10 — POST /api/audit/[entity_type]/[entity_id]/restore
// Body: { target_changed_at: ISO timestamp }
// Restores all tracked fields on the entity to the values they held at
// `target_changed_at`. Implementation lives in the SECURITY DEFINER RPC
// `audit_restore_entity`, called after access check.

interface Ctx {
  params: Promise<{ entity_type: string; entity_id: string }>
}

const bodySchema = z.object({
  target_changed_at: z
    .string()
    .min(1)
    .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid ISO timestamp"),
})

const paramsSchema = z.object({
  entity_type: z.enum(AUDIT_ENTITY_TYPES as unknown as [string, ...string[]]),
  entity_id: z.string().uuid(),
})

export async function POST(request: Request, ctx: Ctx) {
  const { entity_type, entity_id } = await ctx.params
  const paramsParsed = paramsSchema.safeParse({ entity_type, entity_id })
  if (!paramsParsed.success) {
    return apiError(
      "validation_error",
      "Invalid entity_type or entity_id.",
      400
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const bodyParsed = bodySchema.safeParse(body)
  if (!bodyParsed.success) {
    return apiError(
      "validation_error",
      "target_changed_at is required (ISO timestamp).",
      400,
      "target_changed_at"
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // Access check via project lookup
  let projectId: string | null = null
  if (entity_type === "projects") {
    projectId = entity_id
  } else {
    const { data: row, error: lookupErr } = await supabase
      .from(entity_type as AuditEntityType)
      .select("project_id")
      .eq("id", entity_id)
      .maybeSingle()
    if (lookupErr) {
      return apiError("read_failed", lookupErr.message, 500)
    }
    projectId = (row as { project_id: string } | null)?.project_id ?? null
  }
  if (!projectId) {
    return apiError("not_found", "Target entity not found.", 404)
  }
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const { data: result, error: rpcErr } = await supabase
    .rpc("audit_restore_entity", {
      p_entity_type: entity_type,
      p_entity_id: entity_id,
      p_target_changed_at: bodyParsed.data.target_changed_at,
    })
    .single<{
      success: boolean
      message: string
      fields_restored: number
      warnings: Array<{ field: string; reason: string }> | null
    }>()

  if (rpcErr) {
    return apiError("restore_failed", rpcErr.message, 500)
  }
  if (!result?.success) {
    return apiError("restore_failed", result?.message ?? "unknown", 422)
  }

  return NextResponse.json({
    ok: true,
    fields_restored: result.fields_restored,
    warnings: result.warnings ?? [],
  })
}
