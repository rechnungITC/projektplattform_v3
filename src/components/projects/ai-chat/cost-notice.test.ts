import { describe, expect, it } from "vitest"

import { costNotice, type ChatCostSummary } from "./cost-notice"

/**
 * PROJ-Y-151d — AC-151.22 verlangt zwei Dinge, und das zweite ist das
 * wichtigere: bei hinterlegtem Preis wird beziffert, OHNE Preis wird das
 * gesagt statt 0 € zu behaupten.
 *
 * Der QA-Durchgang vom 2026-08-28 fand die Rechnung als Bibliothek ohne jeden
 * Aufrufer — geschrieben, unit-getestet, im Produkt tot. Diese Tests pinnen
 * die Formulierungen, damit ein stiller Rückfall auf „0 €" auffällt.
 */

const known = (amount: number, unpriced = 0): ChatCostSummary => ({
  known: true, amount, currency: "EUR", unpriced,
})

describe("costNotice", () => {
  it("beziffert bei hinterlegtem Preis", () => {
    expect(costNotice(known(1.23))).toBe("Kosten dieser Unterhaltung: 1,23 EUR.")
  })

  it("behauptet bei fehlendem Preis KEINE Null, sondern sagt es", () => {
    const text = costNotice({ known: false, reason: "no_price" })
    expect(text).toContain("nicht bezifferbar")
    // Die tragende Hälfte: nirgends eine Null, die als "kostet nichts" gelesen
    // werden könnte.
    expect(text).not.toMatch(/0[,.]00/)
  })

  it("benennt eine Teilsumme als Teilsumme", () => {
    const text = costNotice(known(0.5, 2))
    expect(text).toContain("0,50 EUR")
    expect(text).toContain("2 Antworten ohne hinterlegten Preis")
  })

  it("zaehlt im Singular korrekt", () => {
    expect(costNotice(known(0.5, 1))).toContain("1 Antwort ohne")
  })

  it("schweigt vor der ersten Antwort statt einen Mangel zu behaupten", () => {
    expect(costNotice({ known: false, reason: "no_tokens" })).toBeNull()
  })

  it("schweigt, solange nichts geladen ist", () => {
    expect(costNotice(null)).toBeNull()
  })

  it("sagt es, wenn die Kosten gerade nicht abrufbar sind", () => {
    // Wichtig, dass dieser Fall NICHT wie "kein Preis" klingt: das eine ist
    // Datenpflege, das andere eine Stoerung.
    const text = costNotice({ known: false, reason: "unavailable" })
    expect(text).toContain("nicht abrufbar")
    expect(text).not.toContain("Preis")
  })

  it("rundet auf Cent und nutzt das deutsche Dezimalzeichen", () => {
    expect(costNotice(known(2))).toBe("Kosten dieser Unterhaltung: 2,00 EUR.")
  })
})
