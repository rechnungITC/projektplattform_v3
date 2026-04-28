import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

import { apiError } from "../../_lib/route-helpers"

/**
 * PROJ-5 — daily cron job that purges wizard drafts older than 90 days.
 *
 * Triggered by Vercel Cron (configured in `vercel.json`). Vercel sends an
 * `Authorization: Bearer <CRON_SECRET>` header on every cron invocation.
 * We verify it before doing anything; without the secret, an attacker who
 * discovered the URL could mass-delete drafts.
 *
 * The cron uses the service-role client because it runs without an
 * authenticated user — RLS would otherwise hide every draft.
 */

const RETENTION_DAYS = 90

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
    .from("project_wizard_drafts")
    .delete({ count: "exact" })
    .lt("updated_at", cutoff)
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
