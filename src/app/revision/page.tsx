import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { RevisionClient, type RevisionTenant } from "./revision-client"

export const metadata: Metadata = {
  title: "Revision · Projektplattform",
  robots: { index: false, follow: false },
}

/**
 * PROJ-Y-130o — Revisions-Sicht für Freigegebene OHNE Mandanten-Mitgliedschaft.
 *
 * Warum eine eigene Seite und kein Rechte-Schalter auf einer bestehenden:
 * `(app)/layout.tsx` leitet jeden Nutzer ohne Mitgliedschaft nach `/onboarding`,
 * und die Audit-Bericht-Seite leitet ihren Mandanten aus `useAuth().currentTenant`
 * ab — beides ist an die Mitgliedschaft gebunden. Ein Revisor ist aber
 * ausdrücklich KEIN Mitglied (γ2: ein vierter Rollenwert hätte ihn überall lesend
 * gemacht). Die Lücke war deshalb keine fehlende Berechtigung, sondern die
 * Mitgliedschafts-Annahme der App-Hülle. Diese Seite liegt darum außerhalb der
 * Hülle und löst ihren Mandanten aus der FREIGABE auf, nicht aus einer
 * Mitgliedschaft.
 *
 * Die Berechtigung liegt weiterhin in der Datenbank: die eine SELECT-Policy auf
 * `audit_reader_grants` (Admin oder Betroffener selbst), das γ1/γ2-Lesetor am
 * Trail und die Gates in `verify_audit_chain` / `requireAuditRead`. Diese Seite
 * fügt kein eigenes Gate hinzu — sie zeigt nur, was ohnehin erlaubt ist.
 */
export default async function RevisionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // EIN Aufruf, eine Wahrheit: `audit_reader_tenants` liefert die eigenen
  // Freigaben samt Mandantennamen und Wirksamkeit. Der Name ist über die Tabelle
  // NICHT lesbar — `tenants` hängt an der Mitgliedschaft, und ein Revisor ist
  // bewusst keines. Und die Wirksamkeit rechnet die Datenbank, nicht diese Seite:
  // eine eigene Frist-Auswertung wäre eine zweite Wahrheit über die Frage, ob
  // jemand gerade lesen darf.
  const { data } = await supabase.rpc("audit_reader_tenants")

  const rows = (data ?? []) as {
    tenant_id: string
    tenant_name: string | null
    valid_until: string | null
    note: string | null
    is_effective: boolean
  }[]

  const tenants: RevisionTenant[] = rows.map((row) => ({
    tenantId: row.tenant_id,
    // Fällt der Name aus, bleibt die Kennung — besser eine technische Angabe als
    // ein erfundener Platzhalter.
    name: row.tenant_name ?? row.tenant_id,
    validUntil: row.valid_until,
    note: row.note,
    expired: !row.is_effective,
  }))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <RevisionClient tenants={tenants} />
    </div>
  )
}
