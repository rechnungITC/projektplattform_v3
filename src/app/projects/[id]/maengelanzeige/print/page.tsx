import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { NOTICE_STATUSES } from "@/lib/construction/defect-notice"
import {
  CONSTRUCTION_DEFECT_SEVERITY_LABELS,
  isDefectOverdue,
} from "@/lib/construction/defects"
import { createClient } from "@/lib/supabase/server"
import type { ModuleKey } from "@/types/tenant-settings"
import type {
  ConstructionDefectSeverity,
  ConstructionDefectStatus,
} from "@/types/construction-defect"

export const metadata: Metadata = {
  title: "Mängelanzeige · Druck",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ trade?: string; vendor?: string }>
}

interface NoticeDefectRow {
  id: string
  defect_number: number
  title: string
  description: string | null
  severity: ConstructionDefectSeverity
  status: ConstructionDefectStatus
  due_date: string | null
  section: { label: string } | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fmtDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE")
}

/**
 * PROJ-45-β — chrome-lose Mängelanzeige (AC-45β.13–.16).
 *
 * Muster PROJ-21/116/131: eine Route **ausserhalb** der `(app)`-Gruppe, damit
 * kein Projektraum-Rahmen mitgedruckt wird, und alle Abfragen über den
 * cookie-gebundenen Sitzungs-Client (`createClient`) — **nie** der
 * Dienst-Schlüssel. Genau daran hängt AC-45β.16: die Anzeige zeigt
 * ausschliesslich Mängel, die der Aufrufer ohnehin sehen darf. Ohne Sitzung
 * greift die Anmelde-Umleitung der Middleware; ein Projekt, das die RLS
 * verbirgt, endet in `notFound()`.
 *
 * Das Modul-Tor wird hier von Hand nachgezogen statt über `requireModuleActive`:
 * dessen Rückgabe ist eine HTTP-Antwort für Routen, eine Seite braucht
 * `notFound()`. Die Regel selbst ist identisch übernommen, inklusive der
 * Vorgabe, bei fehlender Einstellungszeile offen zu bleiben.
 */
export default async function ConstructionDefectNoticePrintPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const { trade, vendor } = await searchParams

  const supabase = await createClient()

  // RLS-gebunden: wer das Projekt nicht sehen darf, bekommt keine Zeile.
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

  const tradeId = trade && UUID.test(trade) ? trade : null
  const vendorId = !tradeId && vendor && UUID.test(vendor) ? vendor : null

  let query = supabase
    .from("construction_defects")
    .select(
      "id, defect_number, title, description, severity, status, due_date, " +
        "section:construction_sections(label)"
    )
    .eq("project_id", id)
    .in("status", [...NOTICE_STATUSES])

  if (tradeId) query = query.eq("trade_id", tradeId)
  if (vendorId) query = query.eq("vendor_id", vendorId)

  const { data: defectRows, error } = await query
    .order("defect_number", { ascending: true })
    .limit(500)

  if (error) notFound()
  const defects = (defectRows ?? []) as unknown as NoticeDefectRow[]

  // Adressat für den Kopf. Beide Auflösungen laufen ebenfalls unter der RLS des
  // Aufrufers; ein fremdes Gewerk liefert schlicht keinen Namen.
  let addressee: string | null = null
  if (tradeId) {
    const { data } = await supabase
      .from("project_construction_trades")
      .select("id, trade:construction_trades(label)")
      .eq("id", tradeId)
      .eq("project_id", id)
      .maybeSingle<{ id: string; trade: { label: string } | null }>()
    addressee = data?.trade?.label ? `Gewerk ${data.trade.label}` : null
  } else if (vendorId) {
    const { data } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("id", vendorId)
      .maybeSingle<{ id: string; name: string }>()
    addressee = data?.name ?? null
  }

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
      <header className="mb-8 border-b pb-4">
        <h1 className="text-xl font-bold">Mängelanzeige</h1>
        <p className="text-sm">{project.name}</p>
        {addressee ? (
          <p className="text-sm font-medium">Adressat: {addressee}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ohne Einschränkung auf Gewerk oder Nachunternehmer
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Erstellt am {generatedAt}
          {author ? ` von ${author}` : ""}
        </p>
      </header>

      {defects.length === 0 ? (
        <p className="text-sm">
          Für diese Auswahl ist derzeit kein offener Mangel erfasst.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm">
            Wir zeigen die folgenden {defects.length}{" "}
            {defects.length === 1 ? "Mangel" : "Mängel"} an und fordern zur
            Nachbesserung innerhalb der jeweils genannten Frist auf.
          </p>
          <ol className="space-y-5">
            {defects.map((d) => {
              // Ein Ort, der nicht gesetzt ist, wird WEGGELASSEN statt als
              // „unbekannt" gedruckt (Edge Case β: der Ort ist beim Rundgang
              // oft noch unpräzise, eine erfundene Angabe wäre schlechter als
              // keine).
              const location = d.section?.label ?? null
              const due = fmtDate(d.due_date)
              const overdue = isDefectOverdue(d.status, d.due_date)
              return (
                <li key={d.id} className="break-inside-avoid border-b pb-4">
                  <p className="font-semibold">
                    Nr. {d.defect_number} · {d.title}
                  </p>
                  <dl className="mt-1 space-y-0.5 text-sm">
                    {d.description ? (
                      <div>
                        <dt className="inline font-medium">Beschreibung: </dt>
                        <dd className="inline whitespace-pre-wrap">
                          {d.description}
                        </dd>
                      </div>
                    ) : null}
                    {location ? (
                      <div>
                        <dt className="inline font-medium">Ort: </dt>
                        <dd className="inline">{location}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="inline font-medium">Schweregrad: </dt>
                      <dd className="inline">
                        {CONSTRUCTION_DEFECT_SEVERITY_LABELS[d.severity]}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">
                        Nachbesserung bis:{" "}
                      </dt>
                      <dd className="inline">
                        {due ?? "ohne Frist"}
                        {overdue ? " (überschritten)" : ""}
                      </dd>
                    </div>
                    {d.status === "erledigt" ? (
                      <div className="text-xs text-muted-foreground">
                        Fertiggemeldet, Prüfung durch die Bauleitung offen.
                      </div>
                    ) : null}
                  </dl>
                </li>
              )
            })}
          </ol>
        </>
      )}

      <footer className="mt-8 text-xs text-muted-foreground">
        Aufgeführt sind offene, in Bearbeitung befindliche und fertiggemeldete
        Mängel. Geprüfte und verworfene Mängel bleiben unberücksichtigt.
      </footer>
    </div>
  )
}
