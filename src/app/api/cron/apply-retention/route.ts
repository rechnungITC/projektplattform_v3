import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import type { RetentionOverrides } from "@/types/tenant-settings"

import { apiError } from "../../_lib/route-helpers"

// PROJ-10 + PROJ-17 — daily cron that purges audit_log_entries older than
// each tenant's policy. PROJ-17 introduced `tenant_settings.retention_overrides
// .audit_log_days` — when set, that wins for the tenant; otherwise the system
// default of 730 days applies. Triggered by Vercel Cron with
// `Authorization: Bearer ${CRON_SECRET}`.

const SYSTEM_DEFAULT_RETENTION_DAYS = 730
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface PerTenantPurge {
  tenant_id: string
  retention_days: number
  cutoff: string
  purged: number
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return apiError(
      "configuration_error",
      "CRON_SECRET is not set on the server.",
      500
    )
  }
  const authHeader = request.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${expected}`) {
    return apiError("unauthorized", "Invalid or missing cron secret.", 401)
  }

  const supabase = createAdminClient()

  // Pull all tenants + their per-tenant retention override (if any).
  const { data: tenants, error: tenantsErr } = await supabase
    .from("tenants")
    .select(
      "id, tenant_settings!inner(retention_overrides)"
    )

  if (tenantsErr) {
    return apiError("read_failed", tenantsErr.message, 500)
  }

  const reports: PerTenantPurge[] = []
  let totalPurged = 0

  for (const row of tenants ?? []) {
    const tenantId = row.id as string
    const tsRows = row.tenant_settings as
      | Array<{ retention_overrides: RetentionOverrides | null }>
      | { retention_overrides: RetentionOverrides | null }
      | null
    const overrides = Array.isArray(tsRows) ? tsRows[0] : tsRows
    const tenantDays = overrides?.retention_overrides?.audit_log_days
    const retentionDays =
      typeof tenantDays === "number" && tenantDays > 0
        ? tenantDays
        : SYSTEM_DEFAULT_RETENTION_DAYS
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY).toISOString()

    const { data, error, count } = await supabase
      .from("audit_log_entries")
      .delete({ count: "exact" })
      .eq("tenant_id", tenantId)
      .lt("changed_at", cutoff)
      .select("id")

    if (error) {
      return apiError("delete_failed", error.message, 500)
    }

    const purged = count ?? data?.length ?? 0
    totalPurged += purged
    reports.push({
      tenant_id: tenantId,
      retention_days: retentionDays,
      cutoff,
      purged,
    })
  }

  return NextResponse.json({
    ok: true,
    total_purged: totalPurged,
    tenants: reports,
  })
}
