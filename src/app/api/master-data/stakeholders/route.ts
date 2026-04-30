import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import type { StakeholderRollupRow } from "@/types/master-data"

import { adminTenantContext } from "../_lib/admin-tenant"

// PROJ-16 — tenant-wide stakeholder rollup with optional CSV export.
// GET /api/master-data/stakeholders?active_only=&role=&org_unit=&search=&format=
//
// admin/PMO read-only. Class-3 fields (contact_email, contact_phone) are
// ALWAYS redacted in CSV export per the locked design choice 3A. In the
// JSON response they are stripped before returning.

const SELECT_COLUMNS = `
  id, tenant_id, project_id, name, role_key, org_unit,
  influence, impact, is_active,
  projects:project_id ( name )
`.replace(/\s+/g, " ").trim()

interface DBRow {
  id: string
  tenant_id: string
  project_id: string
  name: string
  role_key: string
  org_unit: string | null
  influence: number | null
  impact: number | null
  is_active: boolean
  projects: { name: string | null } | { name: string | null }[] | null
}

function projectNameFrom(row: DBRow): string | null {
  if (!row.projects) return null
  if (Array.isArray(row.projects)) return row.projects[0]?.name ?? null
  return row.projects.name ?? null
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows: StakeholderRollupRow[]): string {
  const header =
    "name,role_key,org_unit,influence,impact,is_active,project_name,contact_email,contact_phone\n"
  const body = rows
    .map((r) =>
      [
        r.name,
        r.role_key,
        r.org_unit,
        r.influence,
        r.impact,
        r.is_active ? "true" : "false",
        r.project_name,
        // Class-3 fields ALWAYS redacted in export per design choice 3A.
        "[redacted]",
        "[redacted]",
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n")
  return header + body + "\n"
}

export async function GET(request: Request) {
  const ctx = await adminTenantContext()
  if ("error" in ctx) return ctx.error

  const url = new URL(request.url)
  const activeOnly = url.searchParams.get("active_only") === "true"
  const role = url.searchParams.get("role")
  const orgUnit = url.searchParams.get("org_unit")
  const search = url.searchParams.get("search")
  const format = url.searchParams.get("format") ?? "json"

  let query = ctx.supabase
    .from("stakeholders")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .order("name", { ascending: true })
    .limit(2000)

  if (activeOnly) query = query.eq("is_active", true)
  if (role) query = query.eq("role_key", role)
  if (orgUnit) query = query.eq("org_unit", orgUnit)
  if (search) query = query.ilike("name", `%${search}%`)

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)

  const rows: StakeholderRollupRow[] = ((data ?? []) as unknown as DBRow[]).map((r) => ({
    id: r.id,
    tenant_id: r.tenant_id,
    project_id: r.project_id,
    project_name: projectNameFrom(r),
    name: r.name,
    role_key: r.role_key,
    org_unit: r.org_unit,
    influence: r.influence,
    impact: r.impact,
    is_active: r.is_active,
    // contact_email / contact_phone deliberately omitted in JSON path —
    // the rollup never exposes Class-3 fields to the client.
  }))

  if (format === "csv") {
    return new NextResponse(toCsv(rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stakeholder_rollup_${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      },
    })
  }

  return NextResponse.json({ rows })
}
