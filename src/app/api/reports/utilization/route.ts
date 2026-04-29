import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

// PROJ-11 — cross-project utilization report.
// GET /api/reports/utilization?start=YYYY-MM-DD&end=YYYY-MM-DD&bucket=week|month|quarter[&format=csv]
//
// tenant-admin only (HR-relevant aggregate).

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const querySchema = z
  .object({
    start: isoDate,
    end: isoDate,
    bucket: z.enum(["week", "month", "quarter"]).default("week"),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .refine((v) => v.start <= v.end, {
    message: "start must be ≤ end",
    path: ["end"],
  })

interface UtilizationRow {
  resource_id: string
  resource_name: string
  bucket_start: string
  bucket_end: string
  utilization: number
}

function toCsv(rows: UtilizationRow[]): string {
  const header = "resource_id,resource_name,bucket_start,bucket_end,utilization\n"
  const body = rows
    .map((r) =>
      [
        r.resource_id,
        // simple CSV-safe escape: wrap if contains comma/quote/newline
        /[",\n]/.test(r.resource_name)
          ? `"${r.resource_name.replace(/"/g, '""')}"`
          : r.resource_name,
        r.bucket_start,
        r.bucket_end,
        Number(r.utilization).toFixed(2),
      ].join(",")
    )
    .join("\n")
  return header + body + "\n"
}

export async function GET(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    start: url.searchParams.get("start") ?? "",
    end: url.searchParams.get("end") ?? "",
    bucket: url.searchParams.get("bucket") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
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

  // Resolve the active tenant (first membership). Tenant-admin gate uses it.
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const tenantId = membership?.tenant_id as string | undefined
  if (!tenantId) return apiError("forbidden", "No tenant membership.", 403)

  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return adminDenial

  const moduleDenial = await requireModuleActive(
    supabase,
    tenantId,
    "resources",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase.rpc("utilization_report", {
    p_tenant_id: tenantId,
    p_start: parsed.data.start,
    p_end: parsed.data.end,
    p_bucket: parsed.data.bucket,
  })
  if (error) return apiError("aggregate_failed", error.message, 500)

  const cells = (data ?? []) as UtilizationRow[]

  if (parsed.data.format === "csv") {
    return new NextResponse(toCsv(cells), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="utilization_${parsed.data.start}_${parsed.data.end}_${parsed.data.bucket}.csv"`,
      },
    })
  }

  return NextResponse.json({ cells })
}
