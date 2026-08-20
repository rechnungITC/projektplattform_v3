import { describe, expect, it } from "vitest"

import {
  ACCEPTANCE_OPEN_DEFECT_STATUSES,
  warrantyEndDate,
} from "./acceptances"

describe("warrantyEndDate", () => {
  /**
   * Diese fünf Paare sind LIVE gegen Prod gemessen
   * (`select ('…'::date + make_interval(months => n))::date`) und hier
   * eingefroren. Sie sind der eigentliche Zweck des Tests: die Anzeige darf
   * kein anderes — rechtlich relevantes — Fristende nennen als die Datenbank
   * speichert.
   */
  const MEASURED: Array<[string, number, string]> = [
    ["2026-01-31", 1, "2026-02-28"],
    ["2026-01-31", 48, "2030-01-31"],
    ["2026-08-31", 6, "2027-02-28"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2026-05-31", 60, "2031-05-31"],
  ]

  for (const [from, months, expected] of MEASURED) {
    it(`${from} + ${months} Monate = ${expected} (wie Postgres)`, () => {
      expect(warrantyEndDate(from, months)).toBe(expected)
    })
  }

  it("klemmt am Monatsende statt überzulaufen", () => {
    // Der naive Weg (`setUTCMonth`) hätte hier 2026-03-03 geliefert — genau
    // der Fehler, den diese Funktion behebt.
    expect(warrantyEndDate("2026-01-31", 1)).not.toBe("2026-03-03")
  })

  it("rechnet die üblichen Fristen korrekt", () => {
    expect(warrantyEndDate("2026-09-15", 48)).toBe("2030-09-15")
    expect(warrantyEndDate("2026-09-15", 60)).toBe("2031-09-15")
  })

  it("gibt ohne Datum oder ohne Dauer keine Frist zurück", () => {
    // „Keine Frist" ist ein zulässiger Zustand: eine verweigerte Abnahme setzt
    // keine in Gang (AC-45γ.20).
    expect(warrantyEndDate(null, 48)).toBeNull()
    expect(warrantyEndDate("2026-09-15", null)).toBeNull()
    expect(warrantyEndDate("2026-09-15", 0)).toBeNull()
    expect(warrantyEndDate("", 48)).toBeNull()
  })

  it("weist ein unbrauchbares Datum ab statt zu raten", () => {
    expect(warrantyEndDate("15.09.2026", 48)).toBeNull()
    expect(warrantyEndDate("2026-13-01", 48)).toBeNull()
    expect(warrantyEndDate("nope", 48)).toBeNull()
  })
})

describe("ACCEPTANCE_OPEN_DEFECT_STATUSES", () => {
  it("zählt `erledigt` als offen, `geprueft` und `verworfen` nicht", () => {
    // Für eine Abnahme ist „fertiggemeldet, aber niemand hat nachgesehen" nicht
    // erledigt. Diese Zusicherung ist der Grund, warum die Maske überhaupt eine
    // Bestätigung verlangt, bevor bei offenen Mängeln vorbehaltlos abgenommen
    // wird.
    expect([...ACCEPTANCE_OPEN_DEFECT_STATUSES]).toEqual([
      "offen",
      "in_bearbeitung",
      "erledigt",
    ])
  })
})
