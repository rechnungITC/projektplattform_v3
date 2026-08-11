import { NextResponse } from "next/server"

import { apiError } from "../../_lib/route-helpers"

// PROJ-10 + PROJ-17 + PROJ-130-α — daily retention cron.
//
// HISTORY: until PROJ-130-α this route hard-deleted `audit_log_entries` older
// than each tenant's `retention_overrides.audit_log_days` (system default 730
// days), using the service-role client. That made the platform's own promise
// ("Audit-Einträge sind nicht änderbar und nicht löschbar") false: the trail
// was silently truncated every night at 03:30.
//
// PROJ-130-α (PO lock 2026-08-11): audit retention is UNLIMITED, there is no
// purge. Subject-rights requests are served through the redaction in
// `GET /api/audit/export`, not by deleting the trail.
//
// The purge is disabled in two independent places, on purpose:
//   1. here, so no code path even attempts it, and
//   2. in the database, via the `audit_log_no_delete` guard trigger — a future
//      cron cannot silently reactivate the purge.
//
// The route and its Vercel Cron entry are kept rather than removed so the
// disablement is observable (`audit_purge: "disabled"`) instead of looking like
// a lost job, and so a future retention concern that IS allowed to delete
// (e.g. PROJ-40 assistant transcripts, declared but never enforced) has a home.
//
// Triggered by Vercel Cron with `Authorization: Bearer ${CRON_SECRET}`.

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

  return NextResponse.json({
    ok: true,
    audit_purge: "disabled",
    reason:
      "PROJ-130-α: audit retention is unlimited. The audit trail is append-only and has no purge path; DB-side the `audit_log_no_delete` guard trigger blocks deletion for every role.",
    total_purged: 0,
    tenants: [],
  })
}
