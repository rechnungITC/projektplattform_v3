import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { resolveBudgetSummary } from "@/lib/budget/aggregation"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/types/tenant-settings"

// GET /api/projects/[id]/budget/summary?in_currency=EUR
//   Sammelwährungs-Aggregation. Rechnet alle Posten in die angefragte
//   Currency um. Items mit fehlender Rate erscheinen mit converted_*=null
//   und einer Liste in `missing_rates`.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const url = new URL(request.url)
  const inCurrency = url.searchParams.get("in_currency") ?? "EUR"
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(inCurrency)) {
    return apiError(
      "validation_error",
      `Unsupported currency: ${inCurrency}`,
      400,
      "in_currency"
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (projErr) return apiError("internal_error", projErr.message, 500)
  if (!project) return apiError("not_found", "Project not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    project.tenant_id,
    "budget",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  try {
    const summary = await resolveBudgetSummary({
      supabase,
      projectId,
      tenantId: project.tenant_id,
      inCurrency: inCurrency as SupportedCurrency,
    })
    return NextResponse.json(summary)
  } catch (err) {
    return apiError(
      "summary_failed",
      err instanceof Error ? err.message : "Summary aggregation failed.",
      500
    )
  }
}
