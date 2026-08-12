import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

import { apiError } from "../../_lib/route-helpers"

// PROJ-130-ε — nächtliches Siegeln der Audit-Prüfwert-Kette.
//
// Siegelt je Mandant UND je Quelle (Änderungs-Trail + Zugriffsprotokoll seit
// PROJ-Y-130n) die abgeschlossenen Tagesfenster zu Prüfwert-Ankern. Jeder
// Anker schließt den Prüfwert seines Vorgängers ein — eine Manipulation am Trail
// wird damit nachweisbar, und wer sie durch Nachziehen eines Ankers verdecken
// will, muss die gesamte Folgekette nachziehen.
//
// WARUM SERVICE-ROLE: `seal_audit_chain` ist ausschließlich für `service_role`
// freigegeben. Wer siegeln kann, wählt den Zeitpunkt der Siegelung — das darf
// kein Anwendungsnutzer, auch kein Mandanten-Admin.
//
// SICHERHEITSMARGE: die RPC siegelt nur Tage, die vollständig UND länger als die
// Marge vorbei sind (Vorgabe 2 h). Ohne Marge würde eine spät abgeschlossene
// Transaktion — ihr `now()` liegt im Fenster, sichtbar wird die Zeile erst beim
// Commit — beim nächsten Verifikationslauf wie eine Manipulation aussehen.
//
// Ausgeführt von Vercel Cron mit `Authorization: Bearer ${CRON_SECRET}`.
// Zeitplan: 03:45 UTC, also NACH dem Retention-Lauf (03:30), der seit PROJ-130-α
// nichts mehr löscht.

interface SealRow {
  sealed_tenant_id: string
  /** PROJ-Y-130n: `audit_log` oder `confidential_read` — je Quelle eine eigene Kette. */
  sealed_source: string
  sealed_windows: number
  last_window_start: string
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
  const { data, error } = await supabase.rpc("seal_audit_chain")

  if (error) {
    // Ein fehlgeschlagener Siegel-Lauf darf NICHT still bleiben: ungesiegelte
    // Fenster sind nachträglich nicht mehr manipulationssicher nachweisbar.
    return apiError("seal_failed", error.message, 500)
  }

  const rows = (data ?? []) as SealRow[]
  return NextResponse.json({
    ok: true,
    // Eine Zeile ist seit PROJ-Y-130n eine KETTE (Mandant × Quelle), nicht ein
    // Mandant — der alte Name `tenants_sealed` hätte die Zahl falsch erklärt.
    chains_sealed: rows.length,
    windows_sealed: rows.reduce((sum, r) => sum + (r.sealed_windows ?? 0), 0),
    chains: rows,
  })
}
