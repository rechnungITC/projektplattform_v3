/**
 * PROJ-130-γ2b — die zwei Stellen, an denen die Oberfläche eine echte Aussage
 * über Berechtigung macht:
 *
 * - `grantStatus` unterscheidet abgelaufen von wirksam. Ohne diese Unterscheidung
 *   hält ein Administrator einen Prüfer für berechtigt, der längst nichts mehr
 *   sieht (die Datenbank prüft die Frist bei jedem Lesezugriff).
 * - `endOfDayIso` macht aus dem Datum im Formular den Zeitpunkt, den die API
 *   verlangt. Nähme man Mitternacht, verlöre der Prüfer den Zugang einen Tag
 *   früher als zugesagt.
 */

import { describe, expect, it } from "vitest"

import { endOfDayIso, grantStatus } from "./audit-readers-api"

describe("grantStatus", () => {
  it("meldet unbefristet, wenn keine Frist gesetzt ist", () => {
    expect(grantStatus({ valid_until: null })).toBe("unbefristet")
  })

  it("meldet aktiv für eine Frist in der Zukunft", () => {
    const now = new Date("2026-08-12T10:00:00Z")
    expect(grantStatus({ valid_until: "2026-09-30T21:59:59.000Z" }, now)).toBe("aktiv")
  })

  it("meldet abgelaufen für eine Frist in der Vergangenheit", () => {
    const now = new Date("2026-08-12T10:00:00Z")
    expect(grantStatus({ valid_until: "2026-08-11T21:59:59.000Z" }, now)).toBe(
      "abgelaufen"
    )
  })

  it("behandelt genau den Fristzeitpunkt noch als aktiv (nicht abgelaufen)", () => {
    const stamp = "2026-08-12T10:00:00.000Z"
    expect(grantStatus({ valid_until: stamp }, new Date(stamp))).toBe("aktiv")
  })
})

describe("endOfDayIso", () => {
  it("legt die Frist auf das Ende des gewählten Tages, nicht auf dessen Beginn", () => {
    const iso = endOfDayIso("2026-09-30")
    // Der Offset hängt von der Zeitzone des Bedieners ab; entscheidend ist, dass
    // der Zeitpunkt NACH dem Beginn desselben Tages liegt und noch am Tag endet.
    expect(new Date(iso).getTime()).toBeGreaterThan(
      new Date("2026-09-30T00:00:00").getTime()
    )
    expect(new Date(iso).getTime()).toBeLessThan(
      new Date("2026-10-01T00:00:00").getTime()
    )
  })

  it("liefert einen Zeitpunkt mit Zeitzonen-Offset (die API verlangt das)", () => {
    // toISOString endet auf Z — für Zods datetime({offset:true}) ein gültiger Offset.
    expect(endOfDayIso("2026-01-05")).toMatch(/Z$/)
  })

  it("weist ein unbrauchbares Datum ab statt eine falsche Frist zu senden", () => {
    expect(() => endOfDayIso("30.09.2026")).toThrow(/JJJJ-MM-TT/)
    expect(() => endOfDayIso("")).toThrow()
  })
})
