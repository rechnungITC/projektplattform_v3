/**
 * PROJ-45-δ (AC-45δ.15) — die Kopfzeile.
 *
 * Die `/qa`-Nachweismatrix hat dieses Kriterium als **nur Code** eingestuft:
 * dass die vier Zahlen aus `summary` kommen, steht als Kommentar in der Datei,
 * aber nichts hielt es. Die benannte Gefahr ist konkret — eine künftige Fassung
 * rechnet die Kacheln aus den Listen (`overdue_defects.length`,
 * `trades.filter(is_blocked).length`), und das fällt NICHT auf, weil die Zahlen
 * im Normalfall übereinstimmen.
 *
 * Diese Datei macht sie deshalb absichtlich UNTERSCHIEDLICH: die
 * Zusammenfassung sagt 7 / 5 / 3 / 2, die Listen tragen je eine Zeile bzw. ein
 * unblockiertes Gewerk. Nur eine Kopfzeile, die aus `summary` liest, kann das
 * anzeigen. Genau dieselbe Trennung existiert in echt, weil die Auswertung die
 * Zähler über die ungefilterte Grundmenge rechnet, die Listen aber gedeckelt
 * bzw. auf 14 Tage begrenzt sind.
 *
 * Die Kacheln dürfen zudem nicht ADDIERT werden: „überfällig", „ohne Frist" und
 * „wartet auf Prüfung" sind drei Aussagen über teils dieselben Mängel.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ConstructionScheduleSignals } from "@/types/construction-signals"

const SIGNALS: ConstructionScheduleSignals = {
  project_id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  as_of: "2026-08-21",
  window_days: 14,
  section_depth_cap: 50,
  summary: {
    overdue_defects: 7,
    defects_without_due_date: 5,
    defects_awaiting_review: 3,
    blocked_trades: 2,
    trades_total: 4,
    sections_total: 1,
  },
  trades: [
    {
      project_trade_id: "pt-1",
      trade_id: "t-1",
      trade_label: "Rohbau",
      manual_status: "gruen",
      responsible_user_id: null,
      is_blocked: false,
      blocker_reasons: [],
      overdue_defects: 0,
      defects_without_due_date: 0,
      defects_awaiting_review: 0,
      acceptances_refused: 0,
      acceptances_overdue_scheduled: 0,
      acceptances_with_open_reservations: 0,
    },
  ],
  sections: [],
  deadlines: [],
  overdue_defects: [
    {
      defect_id: "d-1",
      ref_number: 1,
      title: "Nur EINE Zeile in der Liste",
      severity: "gering",
      status: "offen",
      due_date: "2026-08-01",
      days_overdue: 20,
      project_trade_id: "pt-1",
      trade_label: "Rohbau",
      section_id: null,
      section_label: null,
      responsible_user_id: null,
    },
  ],
}

const hookState = {
  signals: SIGNALS as ConstructionScheduleSignals | null,
  loading: false,
  moduleInactive: false,
  error: null as string | null,
  refresh: vi.fn(),
}

vi.mock("@/hooks/use-construction-signals", () => ({
  useConstructionScheduleSignals: () => hookState,
}))
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ currentTenant: { id: "tenant-1" } }),
}))
vi.mock("@/hooks/use-tenant-members", () => ({
  useTenantMembers: () => ({ members: [] }),
}))

// Muss NACH den Mocks importiert werden.
const { ConstructionSignalsPage } = await import("./construction-signals-page")

describe("ConstructionSignalsPage — Kopfzeile", () => {
  beforeEach(() => {
    hookState.signals = SIGNALS
    hookState.moduleInactive = false
    hookState.loading = false
  })

  it("liest die vier Zahlen aus `summary`, nicht aus den Listen", () => {
    render(<ConstructionSignalsPage projectId={SIGNALS.project_id} />)

    // Die Beschriftungen „Überfällig" / „Ohne Frist" / „Wartet auf Prüfung"
    // kommen ABSICHTLICH zweimal vor: einmal als Kachel und einmal als Zahl je
    // Gewerk (AC-45δ.5). Ein `getByText` wäre hier also mehrdeutig — gesucht
    // ist die Stelle, an der die Beschriftung mit dem Wert aus `summary`
    // zusammensteht. Im Gewerk-Block stehen dieselben Beschriftungen mit 0.
    for (const [label, value] of [
      ["Überfällig", "7"],
      ["Ohne Frist", "5"],
      ["Wartet auf Prüfung", "3"],
      ["Offene Blocker", "2"],
    ] as const) {
      const withValue = screen
        .getAllByText(label)
        .filter((el) => el.parentElement?.textContent?.includes(value))
      expect(
        withValue.length,
        `keine Kachel „${label}" mit dem Wert ${value} aus summary`
      ).toBeGreaterThan(0)
    }

    // Die Listen sagen etwas anderes — würde die Kopfzeile aus ihnen rechnen,
    // stünde hier 1 bzw. 0.
    expect(screen.queryByText("Nur EINE Zeile in der Liste")).toBeInTheDocument()
  })

  it("addiert die drei Mangel-Zahlen nicht", () => {
    render(<ConstructionSignalsPage projectId={SIGNALS.project_id} />)

    // 7 + 5 + 3 = 15 wäre die Summe, die denselben Mangel mehrfach zählt.
    expect(screen.queryByText("15")).not.toBeInTheDocument()
  })

  it("zeigt bei inaktivem Modul den Hinweis statt der Fläche", () => {
    hookState.moduleInactive = true
    render(<ConstructionSignalsPage projectId={SIGNALS.project_id} />)

    expect(screen.getByText(/Bauprojekte sind für diesen Arbeitsbereich nicht aktiv/)).toBeInTheDocument()
    expect(screen.queryByText("Überfällig")).not.toBeInTheDocument()
  })
})
