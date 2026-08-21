/**
 * PROJ-45-δ (AC-45δ.7/.9/.10) — der Abschnitts-Block.
 *
 * Die `/qa`-Nachweismatrix hat den entscheidenden JSX-Zweig als **untestet**
 * ausgewiesen: dass bei fehlender Verknüpfung **kein** Balken und **kein**
 * „0 %" erscheint, sondern der Grund. Das ist der Fall, der in Prod heute der
 * NORMALFALL ist (alle drei additiven α-Verweise stehen bei null Zeilen), und
 * er kippt leise — ein `?? 0` an der falschen Stelle genügt.
 *
 * Das Gegenpaar ist genauso wichtig: ein **gemessenes** `0` erscheint sehr wohl
 * als „0 %". Ohne diese zweite Hälfte würde der Test auch bestehen, wenn die
 * Anzeige jeden Prozentwert verschluckt.
 */
import "@testing-library/jest-dom/vitest"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConstructionSignalSectionsBlock } from "./construction-signal-sections-block"
import type { ConstructionSectionSignal } from "@/types/construction-signals"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"

function section(
  over: Partial<ConstructionSectionSignal> = {}
): ConstructionSectionSignal {
  return {
    section_id: "s-1",
    parent_id: null,
    label: "Haus Nord",
    sort_order: 0,
    subtree_depth: 0,
    progress_source: null,
    source_count: 0,
    linked_count: 0,
    progress_percent: null,
    overdue_items: 0,
    phase_linked_count: 0,
    ...over,
  }
}

describe("ConstructionSignalSectionsBlock", () => {
  it("zeigt bei fehlender Verknüpfung den Grund — und nirgends „0 %“", () => {
    render(
      <ConstructionSignalSectionsBlock projectId={PROJECT} sections={[section()]} />
    )

    expect(screen.getByText("Haus Nord")).toBeInTheDocument()
    expect(screen.getByText(/Nichts verknüpft/)).toBeInTheDocument()
    // Der Balken ist eine eigene Aussage („so weit ist es") und darf hier gar
    // nicht existieren, nicht nur auf 0 stehen.
    expect(screen.queryByLabelText(/Fortschritt/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0\s*%/)).not.toBeInTheDocument()
  })

  it("zeigt ein GEMESSENES 0 % sehr wohl an", () => {
    render(
      <ConstructionSignalSectionsBlock
        projectId={PROJECT}
        sections={[
          section({
            progress_source: "work_items",
            source_count: 4,
            linked_count: 4,
            progress_percent: 0,
          }),
        ]}
      />
    )

    expect(screen.getByText(/0\s*%/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Fortschritt/)).toBeInTheDocument()
    // AC-45δ.9 — die Quelle steht dabei, immer.
    expect(screen.getByText(/aus 4 Arbeitspaketen im Teilbaum/)).toBeInTheDocument()
  })

  it("unterscheidet „nichts verknüpft“ von „verknüpft, nichts zählbar“", () => {
    render(
      <ConstructionSignalSectionsBlock
        projectId={PROJECT}
        sections={[
          section({
            section_id: "s-2",
            label: "Nur Abgebrochenes",
            progress_source: "work_items",
            linked_count: 3,
            source_count: 0,
            progress_percent: null,
          }),
        ]}
      />
    )

    // Beide Zahlen werden genannt, damit die Lücke sichtbar ist — und wieder
    // kein „0 %".
    expect(screen.getByText(/3 Arbeitspakete verknüpft/)).toBeInTheDocument()
    expect(screen.getByText(/0 zählbar/)).toBeInTheDocument()
    expect(screen.queryByText(/0\s*%/)).not.toBeInTheDocument()
  })

  it("hält die Hierarchie sichtbar: Kind unter Eltern", () => {
    render(
      <ConstructionSignalSectionsBlock
        projectId={PROJECT}
        sections={[
          section({ section_id: "root", label: "Wurzel", subtree_depth: 1 }),
          section({ section_id: "kid", parent_id: "root", label: "Kind" }),
        ]}
      />
    )

    const labels = screen
      .getAllByText(/Wurzel|Kind/)
      .map((el) => el.textContent)
    expect(labels).toEqual(["Wurzel", "Kind"])
  })
})
