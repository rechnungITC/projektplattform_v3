/**
 * PROJ-45-δ (AC-45δ.1/.2/.3/.5) — der Gewerk-Block.
 *
 * Die `/qa`-Nachweismatrix hat diese Fläche als **nur Code** eingestuft: der
 * Live-Pentest trägt die Datenseite vollständig, aber **keine** Testdatei
 * rendert die Komponente. Genau zwei Aussagen kippen dort besonders leise:
 *
 *  - **AC-45δ.2 — zwei Angaben, BEIDE beschriftet.** Ohne die Beschriftungen
 *    stehen zwei Farben nebeneinander und niemand weiss, welche die Bewertung
 *    der Bauleitung ist und welche aus den Daten kommt. Weichen sie ab, ist
 *    genau das die interessante Information — der Test pinnt deshalb, dass
 *    beide Beschriftungen **und** beide Werte gleichzeitig da sind und keine
 *    die andere ersetzt.
 *  - **AC-45δ.5 — drei Zahlen, nicht addiert.** Eine Summe würde denselben
 *    Mangel doppelt zählen: `erledigt` ist bei „überfällig" bewusst NICHT
 *    dabei.
 *
 * Beschriftungen der Ampel und der Gründe werden gegen die geteilten
 * Konstanten verglichen, nicht gegen abgeschriebene Zeichenketten: eine
 * Umformulierung IN DER BIBLIOTHEK darf den Test nicht brechen, eine zweite
 * Formulierung IM BLOCK muss.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConstructionSignalTradesBlock } from "./construction-signal-trades-block"
import {
  CONSTRUCTION_BLOCKER_REASON_LABELS,
  CONSTRUCTION_MANUAL_STATUS_LABELS,
} from "@/lib/construction/signals"
import type { ConstructionTradeSignal } from "@/types/construction-signals"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"

function trade(over: Partial<ConstructionTradeSignal> = {}): ConstructionTradeSignal {
  return {
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
    ...over,
  }
}

describe("ConstructionSignalTradesBlock", () => {
  it("zeigt beide Angaben beschriftet — auch wenn sie sich widersprechen", () => {
    render(
      <ConstructionSignalTradesBlock
        projectId={PROJECT}
        trades={[
          trade({
            // Der interessante Fall: die Bauleitung sagt grün, die Daten sagen
            // blockiert. Genau hier darf keine der beiden Angaben verschwinden.
            manual_status: "gruen",
            is_blocked: true,
            blocker_reasons: ["overdue_defects"],
            overdue_defects: 2,
          }),
        ]}
      />
    )

    expect(screen.getByText("Bewertung Bauleitung:")).toBeInTheDocument()
    expect(screen.getByText("Aus den Daten:")).toBeInTheDocument()
    expect(screen.getByText(CONSTRUCTION_MANUAL_STATUS_LABELS.gruen)).toBeInTheDocument()
    expect(screen.getByText("Blockiert")).toBeInTheDocument()
  })

  it("benennt den Grund statt nur zu färben", () => {
    render(
      <ConstructionSignalTradesBlock
        projectId={PROJECT}
        trades={[
          trade({
            is_blocked: true,
            blocker_reasons: ["acceptance_refused", "reservations_open"],
            acceptances_refused: 1,
            acceptances_with_open_reservations: 1,
          }),
        ]}
      />
    )

    expect(
      screen.getByText(CONSTRUCTION_BLOCKER_REASON_LABELS.acceptance_refused)
    ).toBeInTheDocument()
    expect(
      screen.getByText(CONSTRUCTION_BLOCKER_REASON_LABELS.reservations_open)
    ).toBeInTheDocument()
    // Nicht genannte Gründe erscheinen auch nicht.
    expect(
      screen.queryByText(CONSTRUCTION_BLOCKER_REASON_LABELS.overdue_defects)
    ).not.toBeInTheDocument()
  })

  it("führt die drei Zahlen getrennt und addiert sie nicht", () => {
    render(
      <ConstructionSignalTradesBlock
        projectId={PROJECT}
        trades={[
          trade({
            is_blocked: true,
            blocker_reasons: ["overdue_defects"],
            overdue_defects: 2,
            defects_without_due_date: 3,
            defects_awaiting_review: 4,
          }),
        ]}
      />
    )

    expect(screen.getByText("Überfällig")).toBeInTheDocument()
    expect(screen.getByText("Ohne Frist")).toBeInTheDocument()
    expect(screen.getByText("Wartet auf Prüfung")).toBeInTheDocument()
    for (const n of ["2", "3", "4"]) {
      expect(screen.getByText(n)).toBeInTheDocument()
    }
    // Die Summe darf NICHT auftauchen — sie zählte denselben Mangel doppelt.
    expect(screen.queryByText("9")).not.toBeInTheDocument()
  })

  it("listet ein Gewerk ohne Befund ausdrücklich statt es weglassen", () => {
    render(
      <ConstructionSignalTradesBlock
        projectId={PROJECT}
        trades={[trade({ trade_label: "Maler" })]}
      />
    )

    expect(screen.getByText("Maler")).toBeInTheDocument()
    expect(screen.getByText("Ohne Befund")).toBeInTheDocument()
  })

  it("behauptet bei gar keinem Gewerk nicht, es sei alles in Ordnung", () => {
    render(<ConstructionSignalTradesBlock projectId={PROJECT} trades={[]} />)

    // PROJ-64-AC-9-Regel: „nichts zugeordnet" ist nicht „keine Blocker".
    expect(screen.getByText(/nichts zu bewerten/)).toBeInTheDocument()
    expect(screen.queryByText("Ohne Befund")).not.toBeInTheDocument()
  })
})
