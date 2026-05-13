import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

import { apiError } from "../../_lib/route-helpers"

// PROJ-63 — daily cleanup for abandoned CSV-import previews.
// Preview rows contain the uploaded CSV report and are not useful forever.
// Vercel Cron calls this endpoint with Authorization: Bearer ${CRON_SECRET}.

const RETENTION_HOURS = 24

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return apiError(
      "configuration_error",
      "CRON_SECRET is not set on the server.",
      500,
    )
  }
  const authHeader = request.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${expected}`) {
    return apiError("unauthorized", "Invalid or missing cron secret.", 401)
  }

  const cutoff = new Date(
    Date.now() - RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString()

  const supabase = createAdminClient()
  const { data, error, count } = await supabase
    .from("organization_imports")
    .delete({ count: "exact" })
    .eq("status", "preview")
    .lt("uploaded_at", cutoff)
    .select("id")

  if (error) return apiError("delete_failed", error.message, 500)

  return NextResponse.json({
    ok: true,
    cutoff,
    purged: count ?? data?.length ?? 0,
  })
}
