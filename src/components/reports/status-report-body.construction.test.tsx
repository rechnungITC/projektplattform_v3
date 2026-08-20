/**
 * PROJ-45-δ (AC-45δ.17/.19, AC-45δ.10) — der Bau-Block des Status-Reports.
 *
 * Die Datei sichert die drei Aussagen, die man dem Bericht ansehen können
 * muss und die kein sichtbarer Fehler sind, wenn sie kippen:
 *
 *  - **Der Abschnitt fehlt ganz, wenn `content.construction` fehlt.** Ein
 *    leerer Abschnitt mit „—" wäre die falsche Aussage: „gilt, ist aber leer"
 *    ist etwas anderes als „gilt für dieses Projekt nicht". Negativ gepinnt,
 *    zusammen mit dem Nachweis, dass der restliche Bericht unverändert
 *    weitergerendert wird.
 *  - **`progress_percent === null` erscheint NIE als „0 %".** Dazu das
 *    Gegenpaar: ein gemessenes `0` erscheint sehr wohl als „0 %" — ohne
 *    diese zweite Hälfte würde der Test auch bestehen, wenn die Anzeige
 *    jeden Prozentwert verschluckt.
 *  - **Die Blockade-Gründe werden nicht neu formuliert.** Verglichen wird
 *    gegen `CONSTRUCTION_BLOCKER_REASON_LABELS` selbst, nicht gegen
 *    abgeschriebene Zeichenketten: eine Umformulierung IN DER BIBLIOTHEK
 *    darf den Test nicht brechen, eine zweite Formulierung IM BERICHT muss.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StatusReportBody } from "./status-report-body"
import { CONSTRUCTION_BLOCKER_REASON_LABELS } from "@/lib/construction/signals"
import type {
  SnapshotConstructionBlock,
  SnapshotContent,
} from "@/lib/reports/types"

const SECTION_TITLE = "Bauspezifische Terminsignale"

function baseContent(): SnapshotContent {
  return {
    header: {
      project_id: "11111111-1111-4111-8111-111111111111",
      project_name: "Neubau Halle 4",
      project_method: "waterfall",
      sponsor_name: null,
      lead_name: null,
      tenant_id: "22222222-2222-4222-8222-222222222222",
      tenant_name: "Bau Test",
      tenant_logo_url: null,
      tenant_accent_color: null,
    },
    traffic_light: "yellow",
    phases: [],
    upcoming_milestones: [],
    top_risks: [],
    top_decisions: [],
    overdue_open_items: [],
    open_items_total: 0,
    work_item_counts: { by_kind: {}, by_status: {} },
    ki_summary: null,
    manual_summary: null,
    generated_by_name: "Testlauf",
    generated_at: "2026-08-20T10:00:00.000Z",
  }
}

function constructionBlock(): SnapshotConstructionBlock {
  return {
    as_of: "2026-08-20T09:59:00.000Z",
    trades_total: 7,
    blocked_trades_total: 2,
    blocked_trades: [
      {
        trade_label: "Rohbau",
        blocker_reasons: ["overdue_defects", "acceptance_refused"],
      },
      { trade_label: "Elektro", blocker_reasons: [] },
    ],
    sections: [
      {
        label: "Bauabschnitt Nord",
        progress_percent: null,
        progress_source: null,
        overdue_items: 3,
      },
      {
        label: "Bauabschnitt Süd",
        progress_percent: null,
        progress_source: "work_items",
        overdue_items: 0,
      },
      {
        label: "Bauabschnitt West",
        progress_percent: 42,
        progress_source: "phases",
        overdue_items: 1,
      },
    ],
    overdue_defects_total: 5,
  }
}

/** Der gerenderte Bau-Abschnitt als Text — für die Negativ-Zusicherungen. */
function constructionSectionText(): string {
  const heading = screen.getByRole("heading", { name: SECTION_TITLE })
  const section = heading.closest("section")
  if (!section) throw new Error("Bau-Abschnitt nicht gefunden")
  return section.textContent ?? ""
}

describe("StatusReportBody — Bau-Block (Guard)", () => {
  it("lässt den Abschnitt ganz weg, wenn der Schlüssel fehlt", () => {
    const content = baseContent()
    expect("construction" in content).toBe(false)

    render(<StatusReportBody version={1} content={content} />)

    expect(
      screen.queryByRole("heading", { name: SECTION_TITLE }),
    ).not.toBeInTheDocument()
    // Kein leerer Abschnitt, aber auch kein abgebrochener Bericht: die
    // generischen Abschnitte stehen weiterhin da.
    expect(
      screen.getByRole("heading", { name: "Top-5-Risiken" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Backlog-Übersicht" }),
    ).toBeInTheDocument()
  })

  it("rendert den Abschnitt, wenn der Block vorhanden ist", () => {
    render(
      <StatusReportBody
        version={2}
        content={{ ...baseContent(), construction: constructionBlock() }}
      />,
    )

    expect(
      screen.getByRole("heading", { name: SECTION_TITLE }),
    ).toBeInTheDocument()
    const text = constructionSectionText()
    expect(text).toContain("7")
    expect(text).toContain("Gewerke")
    expect(text).toContain("blockiert")
    expect(text).toContain("überfällige Mängel")
  })
})

describe("StatusReportBody — Bau-Block (Inhalt)", () => {
  function renderWithBlock(
    override: Partial<SnapshotConstructionBlock> = {},
  ): void {
    render(
      <StatusReportBody
        version={3}
        content={{
          ...baseContent(),
          construction: { ...constructionBlock(), ...override },
        }}
      />,
    )
  }

  it("benennt die Blockade-Gründe mit den Bibliotheks-Formulierungen", () => {
    renderWithBlock()
    const text = constructionSectionText()

    expect(text).toContain("Rohbau")
    expect(text).toContain(CONSTRUCTION_BLOCKER_REASON_LABELS.overdue_defects)
    expect(text).toContain(
      CONSTRUCTION_BLOCKER_REASON_LABELS.acceptance_refused,
    )
    // Nicht genannte Gründe erscheinen auch nicht.
    expect(text).not.toContain(
      CONSTRUCTION_BLOCKER_REASON_LABELS.reservations_open,
    )
  })

  it("sagt es, wenn ein blockiertes Gewerk keinen benannten Grund trägt", () => {
    renderWithBlock()
    expect(constructionSectionText()).toContain("Grund nicht benannt")
  })

  it("zeigt bei fehlendem Fortschritt KEIN 0 %, sondern den Grund", () => {
    renderWithBlock({
      sections: constructionBlock().sections.filter(
        (s) => s.progress_percent === null,
      ),
    })
    const text = constructionSectionText()

    expect(text).not.toContain("0 %")
    expect(text).toContain("Nichts verknüpft — kein Fortschritt berechenbar")
    // Zweiter Null-Fall: verknüpft, aber nichts zählbar — unterscheidbar,
    // sonst wäre ein leerer Abschnitt nicht von einem mit ausschliesslich
    // abgebrochenen Vorgängen zu trennen.
    expect(text).toContain("Arbeitspakete verknüpft, nichts zählbar")
  })

  it("zeigt einen gemessenen Nullfortschritt sehr wohl als 0 %", () => {
    renderWithBlock({
      sections: [
        {
          label: "Bauabschnitt Ost",
          progress_percent: 0,
          progress_source: "work_items",
          overdue_items: 0,
        },
      ],
    })
    const text = constructionSectionText()

    expect(text).toContain("0 %")
    expect(text).not.toContain("kein Fortschritt berechenbar")
  })

  it("zeigt Fortschritt, Quelle und überfällige Vorgänge je Abschnitt", () => {
    renderWithBlock()
    const text = constructionSectionText()

    expect(text).toContain("Bauabschnitt West")
    expect(text).toContain("42 %")
    expect(text).toContain("Quelle: Phasen")
    expect(text).toContain("Überfällige Vorgänge")
  })

  it("benennt einen leeren Abschnitts- bzw. Blockadestand ausdrücklich", () => {
    renderWithBlock({
      blocked_trades: [],
      blocked_trades_total: 0,
      sections: [],
    })
    const text = constructionSectionText()

    expect(text).toContain("Kein Gewerk blockiert.")
    expect(text).toContain("Keine Bauabschnitte angelegt.")
    // Der `isEmpty`-Platzhalter von `SnapshotSection` darf hier nicht greifen:
    // die Zahlen sind eine Aussage, kein leerer Abschnitt.
    expect(text).toContain("Gewerke")
  })
})
