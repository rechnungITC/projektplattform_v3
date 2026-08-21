import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CONSTRUCTION_DEFECT_SEVERITY_LABELS } from "@/lib/construction/defects"
import { createClient } from "@/lib/supabase/server"
import {
  CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLE_LABELS,
  CONSTRUCTION_ACCEPTANCE_STATUS_LABELS,
  type ConstructionAcceptanceParticipantRole,
  type ConstructionAcceptanceStatus,
} from "@/types/construction-acceptance"
import type { ConstructionDefectSeverity } from "@/types/construction-defect"
import type { ModuleKey } from "@/types/tenant-settings"

export const metadata: Metadata = {
  title: "Abnahmeprotokoll · Druck",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ abnahme?: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AcceptanceRow {
  id: string
  acceptance_number: number
  title: string | null
  notes: string | null
  scheduled_for: string
  accepted_on: string | null
  status: ConstructionAcceptanceStatus
  reason: string | null
  warranty_months: number | null
  warranty_end_date: string | null
  supersedes_acceptance_id: string | null
  document_label: string | null
  trade: { trade: { label: string } | null } | null
  section: { label: string } | null
}

interface ParticipantRow {
  id: string
  display_name: string
  role_in_acceptance: ConstructionAcceptanceParticipantRole
  attendance: string
  sort_order: number
}

interface ReservationRow {
  defect_id: string
  defect: {
    defect_number: number
    title: string
    description: string | null
    severity: ConstructionDefectSeverity
    due_date: string | null
    section: { label: string } | null
  } | null
}

function fmt(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

/**
 * PROJ-45-γ — chrome-loses Abnahmeprotokoll (AC-45γ.21–.23).
 *
 * Muster β/PROJ-21/116/131: eine Route **ausserhalb** der `(app)`-Gruppe, damit
 * kein Projektraum-Rahmen mitgedruckt wird, und alle Abfragen über den
 * cookie-gebundenen Sitzungs-Client — **nie** der Dienst-Schlüssel. Genau daran
 * hängt AC-45γ.23: das Protokoll zeigt ausschliesslich, was der Aufrufer
 * ohnehin sehen darf. Ohne Sitzung greift die Anmelde-Umleitung der Middleware;
 * eine Abnahme, die die RLS verbirgt, endet in `notFound()`.
 *
 * Das Modul-Tor wird von Hand nachgezogen statt über `requireModuleActive`:
 * dessen Rückgabe ist eine HTTP-Antwort für Routen, eine Seite braucht
 * `notFound()`. Die Regel ist identisch übernommen, inklusive der Vorgabe, bei
 * fehlender Einstellungszeile offen zu bleiben.
 *
 * Die **Vorbehalte** werden mit ihren Stammdaten gedruckt (Nummer, Titel,
 * Beschreibung, Schweregrad, Frist) und ausdrücklich **ohne** ihren heutigen
 * Status: das Protokoll hält den Stand zum Abnahmezeitpunkt fest, und ein
 * später verworfener oder geprüfter Mangel darf es nicht rückwirkend
 * umschreiben (AC-45γ.17).
 */
export default async function ConstructionAcceptanceProtocolPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { abnahme } = await searchParams

  if (!abnahme || !UUID.test(abnahme)) notFound()

  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, tenant_id")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string; tenant_id: string }>()

  if (!project) notFound()

  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("active_modules")
    .eq("tenant_id", project.tenant_id)
    .maybeSingle<{ active_modules: ModuleKey[] | null }>()

  // Fehlende Einstellungszeile → offen bleiben, wie `requireModuleActive`.
  if (settings && !(settings.active_modules ?? []).includes("construction")) {
    notFound()
  }

  const { data: acceptanceRow } = await supabase
    .from("construction_acceptances")
    .select(
      "id, acceptance_number, title, notes, scheduled_for, accepted_on, status, " +
        "reason, warranty_months, warranty_end_date, supersedes_acceptance_id, " +
        "document_label, " +
        "trade:project_construction_trades(trade:construction_trades(label)), " +
        "section:construction_sections(label)"
    )
    .eq("id", abnahme)
    .eq("project_id", id)
    .maybeSingle()

  if (!acceptanceRow) notFound()
  const a = acceptanceRow as unknown as AcceptanceRow

  const [{ data: participantRows }, { data: reservationRows }] = await Promise.all([
    supabase
      .from("construction_acceptance_participants")
      .select("id, display_name, role_in_acceptance, attendance, sort_order")
      .eq("acceptance_id", abnahme)
      .order("sort_order", { ascending: true }),
    supabase
      .from("construction_acceptance_reservations")
      .select(
        "defect_id, defect:construction_defects(defect_number, title, description, " +
          "severity, due_date, section:construction_sections(label))"
      )
      .eq("acceptance_id", abnahme),
  ])

  const participants = (participantRows ?? []) as unknown as ParticipantRow[]
  const reservations = (reservationRows ?? []) as unknown as ReservationRow[]

  const subject = a.trade?.trade?.label
    ? `Gewerk ${a.trade.trade.label}`
    : a.section?.label
      ? `Bauabschnitt ${a.section.label}`
      : "Gesamtes Projekt"

  const {
    data: { user },
  } = await supabase.auth.getUser()
  let author: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", user.id)
      .maybeSingle<{ id: string; display_name: string | null; email: string | null }>()
    author = profile?.display_name ?? profile?.email ?? null
  }

  const generatedAt = new Date().toLocaleString("de-DE", {
    dateStyle: "long",
    timeStyle: "short",
  })

  return (
    <div
      className="theme-print report-print bg-background p-8 text-foreground"
      data-report-print-ready="true"
    >
      <header className="mb-6 border-b pb-4">
        <h1 className="text-xl font-bold">Abnahmeprotokoll Nr. {a.acceptance_number}</h1>
        <p className="text-sm">{project.name}</p>
        <p className="text-sm font-medium">{subject}</p>
        {a.title && <p className="text-sm">{a.title}</p>}
        {a.supersedes_acceptance_id && (
          <p className="text-xs text-muted-foreground">
            Nachabnahme zu einer vorangegangenen, verweigerten Abnahme
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Erstellt am {generatedAt}
          {author ? ` von ${author}` : ""}
        </p>
      </header>

      <section className="mb-6">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <th className="w-56 py-1 text-left font-medium">Angesetzter Termin</th>
              <td className="py-1">{fmt(a.scheduled_for)}</td>
            </tr>
            <tr>
              <th className="py-1 text-left font-medium">Abnahmedatum</th>
              <td className="py-1">{fmt(a.accepted_on)}</td>
            </tr>
            <tr>
              <th className="py-1 text-left font-medium">Ergebnis</th>
              <td className="py-1 font-semibold">
                {CONSTRUCTION_ACCEPTANCE_STATUS_LABELS[a.status]}
              </td>
            </tr>
            <tr>
              <th className="py-1 text-left font-medium">Gewährleistung</th>
              <td className="py-1">
                {a.warranty_end_date
                  ? `bis ${fmt(a.warranty_end_date)}${
                      a.warranty_months ? ` (${a.warranty_months} Monate)` : ""
                    }`
                  : "keine Frist festgehalten"}
              </td>
            </tr>
            {a.reason && (
              <tr>
                <th className="py-1 text-left align-top font-medium">Begründung</th>
                <td className="py-1">{a.reason}</td>
              </tr>
            )}
            {a.notes && (
              <tr>
                <th className="py-1 text-left align-top font-medium">Bemerkung</th>
                <td className="whitespace-pre-wrap py-1">{a.notes}</td>
              </tr>
            )}
            {a.document_label && (
              <tr>
                <th className="py-1 text-left font-medium">Beleg</th>
                <td className="py-1">{a.document_label}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">Teilnehmer</h2>
        {participants.length === 0 ? (
          <p className="text-sm">Keine Teilnehmer erfasst.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {participants.map((p) => (
              <li key={p.id}>
                {p.display_name} —{" "}
                {CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLE_LABELS[p.role_in_acceptance]}
                {p.attendance === "abwesend" ? " (abwesend)" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-base font-semibold">
          Vorbehalte ({reservations.length})
        </h2>
        {reservations.length === 0 ? (
          <p className="text-sm">
            Bei dieser Abnahme wurden keine Vorbehalte erklärt.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-2">Nr.</th>
                <th className="py-1 pr-2">Beschreibung</th>
                <th className="py-1 pr-2">Ort</th>
                <th className="py-1 pr-2">Schweregrad</th>
                <th className="py-1">Frist</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.defect_id} className="border-b align-top">
                  <td className="py-1 pr-2">{r.defect?.defect_number ?? "—"}</td>
                  <td className="py-1 pr-2">
                    <span className="font-medium">{r.defect?.title}</span>
                    {r.defect?.description && (
                      <span className="block text-xs">{r.defect.description}</span>
                    )}
                  </td>
                  <td className="py-1 pr-2">{r.defect?.section?.label ?? "—"}</td>
                  <td className="py-1 pr-2">
                    {r.defect?.severity
                      ? CONSTRUCTION_DEFECT_SEVERITY_LABELS[r.defect.severity]
                      : "—"}
                  </td>
                  <td className="py-1">{fmt(r.defect?.due_date ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs">
          Nicht in diesem Protokoll erklärte Vorbehalte verfallen mit der Abnahme.
        </p>
      </section>

      <section className="mt-12">
        <div className="grid grid-cols-2 gap-12 text-sm">
          <div>
            <div className="h-12 border-b" />
            <p className="mt-1">Auftraggeber / Bauherr</p>
          </div>
          <div>
            <div className="h-12 border-b" />
            <p className="mt-1">Auftragnehmer</p>
          </div>
        </div>
      </section>
    </div>
  )
}
