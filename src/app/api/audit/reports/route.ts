import { NextResponse } from "next/server"
import { z } from "zod"

import { AUDIT_ENTITY_TYPES } from "@/types/audit"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../_lib/route-helpers"

// PROJ-10 — GET /api/audit/reports
// Tenant-wide audit query for the /reports/audit page. Filters: entity_type,
// actor_user_id, field_name, from_date, to_date. RLS-scoped by the existing
// `can_read_audit_entry` policy on `audit_log_entries` — non-admins see only
// the entries that belong to their projects.

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  entity_type: z
    .enum(AUDIT_ENTITY_TYPES as unknown as [string, ...string[]])
    .optional(),
  actor_user_id: z.string().uuid().optional(),
  field_name: z.string().max(100).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    tenant_id: url.searchParams.get("tenant_id") ?? undefined,
    entity_type: url.searchParams.get("entity_type") ?? undefined,
    actor_user_id: url.searchParams.get("actor_user_id") ?? undefined,
    field_name: url.searchParams.get("field_name") ?? undefined,
    from_date: url.searchParams.get("from_date") ?? undefined,
    to_date: url.searchParams.get("to_date") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid query.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const f = parsed.data
  let query = supabase
    .from("audit_log_entries")
    .select(
      "id, tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, changed_at, change_reason"
    )
    .eq("tenant_id", f.tenant_id)
    .order("changed_at", { ascending: false })
    .limit(f.limit)

  if (f.entity_type) query = query.eq("entity_type", f.entity_type)
  if (f.actor_user_id) query = query.eq("actor_user_id", f.actor_user_id)
  if (f.field_name) query = query.eq("field_name", f.field_name)
  if (f.from_date) query = query.gte("changed_at", f.from_date)
  if (f.to_date) query = query.lte("changed_at", f.to_date)

  const { data, error } = await query
  if (error) {
    return apiError("read_failed", error.message, 500)
  }

  return NextResponse.json({ entries: data ?? [] })
}
