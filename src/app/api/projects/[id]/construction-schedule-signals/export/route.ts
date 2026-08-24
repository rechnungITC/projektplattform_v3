import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import {
  CONSTRUCTION_SIGNAL_EXPORT_SECTIONS,
  type ConstructionScheduleSignals,
  type ConstructionSignalExportSection,
} from "@/types/construction-signals"

// PROJ-45-δ — CSV der Terminsignale.
//
// GET /api/projects/[id]/construction-schedule-signals/export?section=…
//
// EINE Wahrheit: dieselbe SECURITY-INVOKER-Auswertung wie die Fläche
// (`construction_schedule_signals`), nur anders gerendert — keine zweite
// Abfrage, die auseinanderlaufen könnte, und damit derselbe RLS-Umfang: eine
// Zeile, die der Aufrufer nicht sehen darf, wird nicht exportiert. Öffnet in
// Excel; echtes .xlsx ist nicht im Umfang (Muster PROJ-103/PROJ-131).
//
// `section` ist optional; ohne Angabe wird `trades` geliefert — der Kopfblock
// der Fläche und der erste Wert in CONSTRUCTION_SIGNAL_EXPORT_SECTIONS.
// Ein UNBEKANNTER Wert wird dagegen abgewiesen (400) statt still auf den
// Default zu fallen: sonst bekäme ein Tippfehler eine plausible, aber falsche
// Datei.

const DEFAULT_SECTION: ConstructionSignalExportSection = "trades"

/**
 * Bewusst LOKAL kopiert statt in eine geteilte Datei gezogen (D-δ7, Followup
 * PROJ-Y-45k) — dieselbe Entscheidung wie bei den Schwester-Exporten aus
 * PROJ-103 und PROJ-131.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // CSV-Escaping + Neutralisierung von Tabellen-Formeln (=,+,-,@).
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

const COLUMNS: Record<
  ConstructionSignalExportSection,
  readonly string[]
> = {
  trades: [
    "gewerk",
    "manuelle_ampel",
    "verantwortlich",
    "blockiert",
    "blocker_gruende",
    "maengel_ueberfaellig",
    "maengel_ohne_frist",
    "maengel_wartet_auf_pruefung",
    "abnahmen_verweigert",
    "abnahmen_termin_ueberfaellig",
    "abnahmen_offene_vorbehalte",
  ],
  sections: [
    "abschnitt",
    "teilbaum_tiefe",
    // PROJ-Y-45l: die Kappung steht auch in der CSV. Sie hier weglassen hiesse,
    // die stille Unterberichtung nur aus der Oberflaeche zu entfernen und in
    // der maschinenlesbaren Ausgabe stehen zu lassen.
    "teilbaum_gekappt",
    "fortschritt_quelle",
    "fortschritt_prozent",
    "gezaehlte_vorgaenge",
    "verknuepfte_vorgaenge",
    "ueberfaellige_vorgaenge",
    "verknuepfte_phasen",
  ],
  deadlines: [
    "art",
    "nummer",
    "bezeichnung",
    "frist",
    "verstrichen",
    "gewerk",
    "abschnitt",
  ],
  overdue_defects: [
    "nummer",
    "titel",
    "schwere",
    "status",
    "frist",
    "tage_ueber_frist",
    "gewerk",
    "abschnitt",
    "verantwortlich",
  ],
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400, "id")
  }

  const sectionParam =
    new URL(request.url).searchParams.get("section") ?? DEFAULT_SECTION
  const parsedSection = z
    .enum(CONSTRUCTION_SIGNAL_EXPORT_SECTIONS)
    .safeParse(sectionParam)
  if (!parsedSection.success) {
    return apiError("invalid_section", "Unknown export section.", 400, "section")
  }
  const section = parsedSection.data

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase.rpc("construction_schedule_signals", {
    p_project_id: projectId,
  })
  if (error) return apiError("export_failed", error.message, 500)

  const signals = (data as ConstructionScheduleSignals | null) ?? null
  const trades = signals?.trades ?? []
  const sections = signals?.sections ?? []
  const deadlines = signals?.deadlines ?? []
  const overdueDefects = signals?.overdue_defects ?? []

  // Anzeigenamen der Verantwortlichen auflösen (`profiles` ist unter der RLS
  // des Aufrufers lesbar) — nur für die zwei Abschnitte, die sie überhaupt
  // führen. Muster: PROJ-103-Export.
  const ownerIds = new Set<string>()
  if (section === "trades") {
    for (const t of trades) if (t.responsible_user_id) ownerIds.add(t.responsible_user_id)
  } else if (section === "overdue_defects") {
    for (const d of overdueDefects) {
      if (d.responsible_user_id) ownerIds.add(d.responsible_user_id)
    }
  }
  const nameById = new Map<string, string>()
  if (ownerIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", Array.from(ownerIds))
    for (const p of (profiles ?? []) as {
      id: string
      display_name: string | null
      email: string | null
    }[]) {
      nameById.set(p.id, p.display_name ?? p.email ?? p.id)
    }
  }
  const ownerName = (uid: string | null) =>
    uid ? (nameById.get(uid) ?? uid) : ""

  let rows: string[] = []

  if (section === "trades") {
    rows = trades.map((t) =>
      [
        t.trade_label,
        t.manual_status,
        ownerName(t.responsible_user_id),
        t.is_blocked ? "ja" : "nein",
        t.blocker_reasons.join(" "),
        t.overdue_defects,
        t.defects_without_due_date,
        t.defects_awaiting_review,
        t.acceptances_refused,
        t.acceptances_overdue_scheduled,
        t.acceptances_with_open_reservations,
      ]
        .map(csvCell)
        .join(",")
    )
  } else if (section === "sections") {
    rows = sections.map((s) =>
      [
        s.label,
        s.subtree_depth,
        s.subtree_truncated ? "ja" : "nein",
        // `null` heisst „nichts verknüpft" — die Zelle bleibt LEER statt 0 %
        // zu behaupten (AC-45δ.10). csvCell macht aus null den Leerstring.
        s.progress_source,
        s.progress_percent,
        s.source_count,
        s.linked_count,
        s.overdue_items,
        s.phase_linked_count,
      ]
        .map(csvCell)
        .join(",")
    )
  } else if (section === "deadlines") {
    rows = deadlines.map((d) =>
      [
        d.kind,
        d.ref_number,
        d.label,
        d.due_on,
        d.is_elapsed ? "ja" : "nein",
        d.trade_label,
        d.section_label,
      ]
        .map(csvCell)
        .join(",")
    )
  } else {
    rows = overdueDefects.map((d) =>
      [
        d.ref_number,
        d.title,
        d.severity,
        d.status,
        d.due_date,
        d.days_overdue,
        d.trade_label,
        d.section_label,
        ownerName(d.responsible_user_id),
      ]
        .map(csvCell)
        .join(",")
    )
  }

  const csv = `${COLUMNS[section].join(",")}\n${rows.join("\n")}`
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `terminsignale-${projectId.slice(0, 8)}-${section}-${stamp}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Der RLS-begrenzte Umfang wird ausgesprochen, damit ein unvollständiger
      // Export nicht für den vollen Bestand gehalten wird.
      "X-Export-Scope": "construction-schedule-signals-visible-to-caller",
    },
  })
}
