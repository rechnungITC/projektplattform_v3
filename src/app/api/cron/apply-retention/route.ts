import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

import { apiError } from "../../_lib/route-helpers"

// PROJ-10 — daily cron that purges audit_log_entries older than the policy.
// Default 730 days. Per-tenant overrides via PROJ-17's tenant_settings come
// later — for now a single global cutoff applies.
// Triggered by Vercel Cron with `Authorization: Bearer ${CRON_SECRET}`.

const RETENTION_DAYS = 730

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

  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const supabase = createAdminClient()
  const { data, error, count } = await supabase
    .from("audit_log_entries")
    .delete({ count: "exact" })
    .lt("changed_at", cutoff)
    .select("id")

  if (error) {
    return apiError("delete_failed", error.message, 500)
  }

  return NextResponse.json({
    ok: true,
    cutoff,
    purged: count ?? data?.length ?? 0,
  })
}
