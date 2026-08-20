import { describe, expect, it } from "vitest"

import {
  buildBlockingMessage,
  parseBlockingRefs,
  type ConstructionBlockingRef,
} from "./blocking-refs"

const mangel = (n: number, label: string): ConstructionBlockingRef => ({
  kind: "mangel",
  id: `d${n}`,
  ref_number: n,
  label,
})
const abnahme = (n: number, label: string): ConstructionBlockingRef => ({
  kind: "abnahme",
  id: `a${n}`,
  ref_number: n,
  label,
})

describe("buildBlockingMessage", () => {
  it("keeps the beta wording when only defects block", () => {
    // Der β-Fall MUSS sich unveraendert lesen — die Verallgemeinerung darf ihn
    // nicht verwaessern. Rot-Gruen dazu: mit hartem „Eintraege" faellt dieser Fall.
    const msg = buildBlockingMessage("Gewerk", [mangel(4, "Riss im Putz")])
    expect(msg).toContain("Zu diesem Gewerk bestehen noch Mängel")
    expect(msg).toContain("#4 Riss im Putz")
    expect(msg).not.toContain("Abnahmen")
  })

  it("names BOTH kinds when both block — the whole point of the fix", () => {
    const msg = buildBlockingMessage("Gewerk", [
      mangel(4, "Riss"),
      abnahme(2, "Elektro-Abnahme"),
    ])
    expect(msg).toContain("Mängel und Abnahmen")
    expect(msg).toContain("#4 Riss")
    expect(msg).toContain("#2 Elektro-Abnahme")
  })

  it("says only 'Abnahmen' when no defect is involved", () => {
    // Genau der Fall, in dem die alte Meldung FALSCH gewesen waere: sie haette
    // von Maengeln gesprochen, die es nicht gibt.
    const msg = buildBlockingMessage("Gewerk", [abnahme(2, "Elektro-Abnahme")])
    expect(msg).toContain("bestehen noch Abnahmen")
    expect(msg).not.toContain("Mängel und")
  })

  it("uses the subtree wording for sections", () => {
    const msg = buildBlockingMessage("Abschnitt", [mangel(1, "Fuge")])
    expect(msg).toContain("In diesem Abschnitt oder darunter")
  })

  it("names the two possible kinds when nothing can be named", () => {
    const msg = buildBlockingMessage("Gewerk", [])
    expect(msg).toContain("Mängel oder Abnahmen")
  })

  it("caps the named entries", () => {
    const many = Array.from({ length: 25 }, (_, i) => mangel(i + 1, `M${i + 1}`))
    const msg = buildBlockingMessage("Gewerk", many)
    expect(msg.split(",").length).toBe(10)
  })

  it("names the KIND even when the entry itself cannot be named", () => {
    // Diese Erwartung war im ersten Wurf falsch herum: ich hatte den Rueckfall
    // „Mängel oder Abnahmen" erwartet. Richtig ist die engere Aussage — die
    // ART ist ja bekannt, nur die Bezeichnung fehlt. Ein blankes „#" darf
    // dabei nicht herausrutschen.
    const msg = buildBlockingMessage("Gewerk", [
      { kind: "mangel", id: "d1", ref_number: 0, label: "namenlos" },
    ])
    expect(msg).not.toContain("#")
    expect(msg).toContain("bestehen noch Mängel")
    expect(msg).not.toContain("oder Abnahmen")
  })
})

describe("parseBlockingRefs", () => {
  it("returns an empty list for anything that is not an array", () => {
    // Die Auskunft kann fehlschlagen; ein 500 waere die falsche Antwort, denn
    // das Entfernen WURDE aus bekanntem Grund abgelehnt.
    expect(parseBlockingRefs(null)).toEqual([])
    expect(parseBlockingRefs({ kind: "mangel" })).toEqual([])
    expect(parseBlockingRefs("boom")).toEqual([])
  })

  it("drops rows with an unknown kind rather than trusting them", () => {
    expect(
      parseBlockingRefs([
        { kind: "erfunden", id: "x", ref_number: 1, label: "x" },
        { kind: "mangel", id: "d1", ref_number: 1, label: "ok" },
      ])
    ).toEqual([{ kind: "mangel", id: "d1", ref_number: 1, label: "ok" }])
  })

  it("tolerates a missing label but never a missing id", () => {
    expect(parseBlockingRefs([{ kind: "abnahme", id: "a1", ref_number: 2 }])).toEqual([
      { kind: "abnahme", id: "a1", ref_number: 2, label: null },
    ])
    expect(parseBlockingRefs([{ kind: "abnahme", ref_number: 2 }])).toEqual([])
  })
})
