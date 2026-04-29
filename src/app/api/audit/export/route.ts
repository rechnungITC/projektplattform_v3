import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { AUDIT_ENTITY_TYPES } from "@/types/audit"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

// PROJ-10 — GET /api/audit/export
// Tenant-admin-only audit export. Class-3 fields (stakeholders.name,
// contact_email, contact_phone, linked_user_id, notes) are redacted by
// default; passing `redaction_off=true` requires admin (already enforced)
// AND inserts a row into `retention_export_log` for audit-on-audit.

const CLASS_3_STAKEHOLDER_FIELDS = new Set([
  "name",
  "contact_email",
  "contact_phone",
  "linked_user_id",
  "notes",
])
const REDACTED = "[redacted:class-3]"

const querySchema = z.object({
  tenant_id: z.string().uuid(),
  entity_type: z
    .enum(AUDIT_ENTITY_TYPES as unknown as [string, ...string[]])
    .optional(),
  actor_user_id: z.string().uuid().optional(),
  field_name: z.string().max(100).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  format: z.enum(["json", "csv"]).optional().default("json"),
  redaction_off: z.coerce.boolean().optional().default(false),
})

interface AuditRow {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  actor_user_id: string | null
  changed_at: string
  change_reason: string | null
}

function maybeRedact(row: AuditRow, redactionOff: boolean): AuditRow {
  if (redactionOff) return row
  if (
    row.entity_type === "stakeholders" &&
    CLASS_3_STAKEHOLDER_FIELDS.has(row.field_name)
  ) {
    return { ...row, old_value: REDACTED, new_value: REDACTED }
  }
  return row
}

function toCsv(rows: AuditRow[]): string {
  const headers = [
    "id",
    "tenant_id",
    "entity_type",
    "entity_id",
    "field_name",
    "old_value",
    "new_value",
    "actor_user_id",
    "changed_at",
    "change_reason",
  ]
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ""
    const s = typeof v === "string" ? v : JSON.stringify(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => escape((row as unknown as Record<string, unknown>)[h]))
        .join(",")
    )
  }
  return lines.join("\n")
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    tenant_id: url.searchParams.get("tenant_id") ?? undefined,
    entity_type: url.searchParams.get("entity_type") ?? undefined,
    actor_user_id: url.searchParams.get("actor_user_id") ?? undefined,
    field_name: url.searchParams.get("field_name") ?? undefined,
    from_date: url.searchParams.get("from_date") ?? undefined,
    to_date: url.searchParams.get("to_date") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
    redaction_off: url.searchParams.get("redaction_off") ?? undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid query.",
      400
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const adminError = await requireTenantAdmin(
    supabase,
    parsed.data.tenant_id,
    userId
  )
  if (adminError) return adminError

  const moduleDenial = await requireModuleActive(
    supabase,
    parsed.data.tenant_id,
    "audit_reports",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const f = parsed.data
  let query = supabase
    .from("audit_log_entries")
    .select(
      "id, tenant_id, entity_type, entity_id, field_name, old_value, new_value, actor_user_id, changed_at, change_reason"
    )
    .eq("tenant_id", f.tenant_id)
    .order("changed_at", { ascending: false })

  if (f.entity_type) query = query.eq("entity_type", f.entity_type)
  if (f.actor_user_id) query = query.eq("actor_user_id", f.actor_user_id)
  if (f.field_name) query = query.eq("field_name", f.field_name)
  if (f.from_date) query = query.gte("changed_at", f.from_date)
  if (f.to_date) query = query.lte("changed_at", f.to_date)

  const { data, error } = await query
  if (error) {
    return apiError("read_failed", error.message, 500)
  }

  const rows = (data ?? []) as AuditRow[]
  const redacted = rows.map((r) => maybeRedact(r, f.redaction_off))

  // Audit-on-audit: log the export (especially when redaction_off=true).
  await supabase.from("retention_export_log").insert({
    tenant_id: f.tenant_id,
    actor_user_id: userId,
    scope: {
      entity_type: f.entity_type ?? null,
      actor_user_id: f.actor_user_id ?? null,
      field_name: f.field_name ?? null,
      from_date: f.from_date ?? null,
      to_date: f.to_date ?? null,
      format: f.format,
    },
    redaction_off: f.redaction_off,
    row_count: redacted.length,
  })

  if (f.format === "csv") {
    return new NextResponse(toCsv(redacted), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=audit-export-${new Date().toISOString().slice(0, 10)}.csv`,
      },
    })
  }

  return NextResponse.json({ entries: redacted })
}
