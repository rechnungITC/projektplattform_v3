/**
 * PROJ-80-α.2c — nächtlicher Aufräumlauf für Auszug und Quintessenz.
 *
 * Der Regelfall ist der Anstoß im Hintergrund der Upload-Antwort (`after()`).
 * Der scheitert aber lautlos, wenn die Funktion vorher endet, der Prozess
 * neu startet oder ein Anbieter genau in dem Moment ausfällt. Ohne einen
 * zweiten Weg bliebe so ein Dokument dauerhaft ohne Quintessenz, ohne dass
 * jemand es merkt.
 *
 * Der Lauf holt bewusst NUR nach, was nachweislich fehlt — er erzeugt nichts
 * neu, was bereits einen Zustand hat. Ein Dokument mit `status='failed'` bleibt
 * `failed`: die Wiederholung ist eine bewusste Nutzerhandlung, kein nächtliches
 * Wiederkäuen, das Kosten verursacht und immer wieder am selben Fehler scheitert.
 *
 * **PROJ-Y-45p — zweiter Schritt: der Speicherzähler-Sweep.** Reitet bewusst auf
 * diesem Lauf statt einen siebten Zeitplan anzulegen (Muster PROJ-144, PROJ-130-δ);
 * thematisch gehört er hierher, weil dies der DMS-Cron ist. Die Trigger auf
 * `documents` halten den Zähler bei jedem Schreibweg durch SQL richtig — der
 * Sweep ist das Netz für alles, was daran vorbeigeht: Teardowns unter
 * `session_replication_role = replica` (dort sind Trigger aus) und
 * Objekte, die ohne `documents`-Zeile im Bucket landen. Genau so ist die vor
 * PROJ-Y-45p in Prod gemessene Drift entstanden.
 *
 * Der Sweep läuft AUCH, wenn der Quintessenz-Teil scheitert: er hängt an keinem
 * Anbieter und darf nicht von einem AI-Fehler mitgerissen werden.
 */

import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import { runDocumentSummary } from "@/lib/dms/summary-runner"
import { createAdminClient } from "@/lib/supabase/admin"

/** Obergrenze je Lauf — hält die Funktionslaufzeit beschränkt. */
const MAX_PER_RUN = 25

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return apiError("configuration_error", "CRON_SECRET is not set on the server.", 500)
  }
  const authHeader = request.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${expected}`) {
    return apiError("unauthorized", "Invalid or missing cron secret.", 401)
  }

  const supabase = createAdminClient()

  // Auszug vorhanden und geprüft, aber keine Quintessenz-Zeile: genau die
  // Lücke, die ein abgebrochener Hintergrundlauf hinterlässt.
  const { data: pending, error } = await supabase
    .from("document_extractions")
    .select("document_id, tenant_id")
    .eq("status", "extracted")
    .limit(MAX_PER_RUN)

  if (error) {
    return apiError("query_failed", error.message, 500)
  }

  const candidates = pending ?? []
  let attempted = 0
  let created = 0
  let stale = 0

  for (const row of candidates) {
    const { data: existing } = await supabase
      .from("document_summaries")
      .select("document_id")
      .eq("document_id", row.document_id)
      .maybeSingle()
    if (existing) continue

    attempted += 1
    // `actorUserId` ist hier der Systemlauf; `ki_runs.actor_user_id` ist
    // nullable nicht erlaubt, deshalb wird der Ersteller des Dokuments
    // eingesetzt — der Lauf gehört fachlich zu seinem Upload.
    const { data: doc } = await supabase
      .from("documents")
      .select("created_by")
      .eq("id", row.document_id)
      .maybeSingle()
    if (!doc?.created_by) continue

    const result = await runDocumentSummary({
      tenantId: row.tenant_id,
      documentId: row.document_id,
      actorUserId: doc.created_by,
    })
    if (result?.status === "auto") created += 1
    else if (result?.status === "stale") stale += 1
  }

  // PROJ-Y-45p: Speicherzähler-Sweep. Bewusst NACH der Quintessenz-Runde und mit
  // eigener Fehlerbehandlung — ein Anbieterausfall oben darf den Sweep nicht
  // verhindern, und ein Sweep-Fehler darf die geschriebenen Quintessenzen nicht
  // als Fehlschlag ausgeben. Der Zustand wird im Ergebnis benannt statt
  // verschluckt (PROJ-130-α-Muster: `audit_purge:"disabled"`).
  let quotaSweep: { tenants_swept: number; corrected: number } | { error: string }
  const { data: sweep, error: sweepError } = await supabase.rpc(
    "dms_sweep_storage_quotas",
  )
  if (sweepError) {
    quotaSweep = { error: sweepError.message }
  } else {
    const row = (Array.isArray(sweep) ? sweep[0] : sweep) as
      | { tenants_swept: number; corrected: number }
      | undefined
    quotaSweep = row ?? { error: "no_result" }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    attempted,
    created,
    stale,
    quota_sweep: quotaSweep,
  })
}
