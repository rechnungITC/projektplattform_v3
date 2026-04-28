import { NextResponse } from "next/server"
import { z } from "zod"

import { AUDIT_ENTITY_TYPES } from "@/types/audit"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../../_lib/route-helpers"

// PROJ-10 — GET /api/audit/[entity_type]/[entity_id]/history
// Returns the field-level audit trail for a single entity, RLS-scoped by
// `can_read_audit_entry()` (project member or tenant admin).

interface Ctx {
  params: Promise<{ entity_type: string; entity_id: string }>
}

const paramsSchema = z.object({
  entity_type: z.enum(AUDIT_ENTITY_TYPES as unknown as [string, ...string[]]),
  entity_id: z.string().uuid(),
})

export async function GET(request: Request, ctx: Ctx) {
  const { entity_type, entity_id } = await ctx.params
  const parsed = paramsSchema.safeParse({ entity_type, entity_id })
  if (!parsed.success) {
    return apiError(
      "validation_error",
      "Invalid entity_type or entity_id.",
      400
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const url = new URL(request.url)
  const limit = Math.min(
    Number.parseInt(url.searchParams.get("limit") ?? "200", 10) || 200,
    1000
  )

  const { data, error } = await supabase
    .from("audit_log_entries")
    .select(
      "id, tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, changed_at, change_reason"
    )
    .eq("entity_type", entity_type)
    .eq("entity_id", entity_id)
    .order("changed_at", { ascending: false })
    .limit(limit)

  if (error) {
    return apiError("read_failed", error.message, 500)
  }

  return NextResponse.json({ entries: data ?? [] })
}
