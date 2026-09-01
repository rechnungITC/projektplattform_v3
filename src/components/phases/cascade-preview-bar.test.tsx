import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

// `@testing-library/user-event` ist in diesem Repo NICHT installiert (nur `dom`,
// `jest-dom`, `react`) und ein neues Paket waere CIA-pflichtig. Das Haus nutzt
// `fireEvent` — Praezedenz `dependency-edit-dialog.test.tsx` aus beta.1.

import {
  CascadePreviewBar,
  cascadeHeadline,
  type CascadePreviewSummary,
} from "./cascade-preview-bar"

/**
 * PROJ-155-β.2 — die Vorschau-Kopfzeile.
 *
 * Sie ist der sichtbare Teil der Entscheidung „Vorschau statt stiller Kaskade".
 * Geprüft wird deshalb vor allem, was sie **nicht** verschweigt: terminlose
 * Nachfolger (AC-16), verletzte Bedingungen und eine gekappte Kette.
 */

const leer: CascadePreviewSummary = {
  shiftCount: 0,
  commonDeltaDays: null,
  skippedCount: 0,
  conflictCount: 0,
  truncated: false,
}

describe("cascadeHeadline — die Zahl im Satz (AC-13)", () => {
  it("nennt Zahl und Tage", () => {
    expect(cascadeHeadline({ ...leer, shiftCount: 12, commonDeltaDays: 4 })).toBe(
      "12 Nachfolger verschieben sich um 4 Tage",
    )
  })

  it("beugt den Einzelfall richtig", () => {
    expect(cascadeHeadline({ ...leer, shiftCount: 1, commonDeltaDays: 1 })).toBe(
      "1 Nachfolger verschiebt sich um 1 Tag",
    )
  })

  it("sagt bei gemischten Verschiebungen NICHT eine erfundene Zahl", () => {
    expect(
      cascadeHeadline({ ...leer, shiftCount: 3, commonDeltaDays: null }),
    ).toBe("3 Nachfolger verschieben sich unterschiedlich weit")
  })

  it("nennt den leeren Fall beim Namen", () => {
    expect(cascadeHeadline(leer)).toBe("Keine Nachfolger betroffen")
  })
})

describe("CascadePreviewBar — was nicht verschwiegen wird", () => {
  it("benennt terminlose Nachfolger statt sie zu verschweigen (AC-16)", () => {
    render(
      <CascadePreviewBar
        summary={{ ...leer, shiftCount: 2, commonDeltaDays: 3, skippedCount: 1 }}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/bekommt keinen Termin \(keiner gesetzt\)/),
    ).toBeInTheDocument()
  })

  it("benennt verletzte Bedingungen und sagt, dass Uebernehmen moeglich bleibt", () => {
    render(
      <CascadePreviewBar
        summary={{ ...leer, shiftCount: 2, commonDeltaDays: 3, conflictCount: 2 }}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/2 Abhängigkeiten bleiben danach verletzt/)).toBeInTheDocument()
    expect(screen.getByText(/der Plan wird dann eng/)).toBeInTheDocument()
    // Uebernehmen bleibt bedienbar — der Konflikt ist ein Hinweis, kein Riegel.
    expect(screen.getByRole("button", { name: /Übernehmen/ })).toBeEnabled()
  })

  it("sagt, wenn die Kette gekappt wurde", () => {
    render(
      <CascadePreviewBar
        summary={{ ...leer, shiftCount: 200, commonDeltaDays: 1, truncated: true }}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/die Vorschau ist\s+unvollständig/)).toBeInTheDocument()
  })

  it("zeigt ohne Hinweise auch keine Hinweisliste", () => {
    render(
      <CascadePreviewBar
        summary={{ ...leer, shiftCount: 3, commonDeltaDays: 2 }}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.queryByText(/keinen Termin/)).not.toBeInTheDocument()
    expect(screen.queryByText(/verletzt/)).not.toBeInTheDocument()
  })
})

describe("CascadePreviewBar — die zwei Handlungen (AC-14)", () => {
  it("Uebernehmen und Verwerfen rufen je ihren Rueckweg", () => {
    const onApply = vi.fn()
    const onDiscard = vi.fn()
    render(
      <CascadePreviewBar
        summary={{ ...leer, shiftCount: 2, commonDeltaDays: 3 }}
        onApply={onApply}
        onDiscard={onDiscard}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Übernehmen/ }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onDiscard).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /Verwerfen/ }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it("waehrend des Schreibens sind beide Knoepfe gesperrt", () => {
    render(
      <CascadePreviewBar
        summary={{ ...leer, shiftCount: 2, commonDeltaDays: 3 }}
        busy
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: /Übernehmen …/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Verwerfen/ })).toBeDisabled()
  })

  it("traegt einen zugaenglichen Namen", () => {
    render(
      <CascadePreviewBar
        summary={{ ...leer, shiftCount: 1, commonDeltaDays: 1 }}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(
      screen.getByRole("region", { name: "Vorschau der Terminverschiebung" }),
    ).toBeInTheDocument()
  })
})
