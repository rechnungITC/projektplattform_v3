import { describe, expect, it } from "vitest"

import {
  analyzeTokenDrift,
  countDirectColors,
  nextBaseline,
  type Baseline,
} from "./analyze"

const EMPTY: Baseline = { permanent: {}, debt: {} }

describe("countDirectColors", () => {
  it("erkennt Palette-Utilities mit allen Praefixen", () => {
    expect(countDirectColors('className="bg-emerald-600"')).toBe(1)
    expect(countDirectColors('className="text-amber-400 border-rose-200"')).toBe(2)
    expect(countDirectColors('className="ring-sky-500 shadow-red-900"')).toBe(2)
  })

  it("erkennt Alpha-Suffixe, weil bg-emerald-600/10 dieselbe Umgehung ist", () => {
    expect(countDirectColors('className="bg-emerald-600/10"')).toBe(1)
  })

  it("laesst semantische Tokens in Ruhe — das ist der Sinn der Regel", () => {
    // Diese Zeile ist die eigentliche Zusicherung: der Guard darf genau die
    // Schreibweise NICHT treffen, zu der er erziehen soll.
    expect(
      countDirectColors(
        'className="bg-risk-low/10 text-success border-warning/20 text-muted-foreground bg-primary"',
      ),
    ).toBe(0)
  })

  it("trifft keine Nicht-Farb-Utilities mit Zahlen", () => {
    expect(countDirectColors('className="w-500 gap-100 z-50 grid-cols-900"')).toBe(0)
  })

  it("zaehlt bei mehrfachem Aufruf stabil (kein lastIndex-Leck)", () => {
    // Ein geteiltes RegExp mit `g`-Flag traegt `lastIndex` weiter und wuerde
    // jede zweite Datei unterzaehlen — dieselbe Falle wie in PROJ-Y-130g.
    const source = 'className="bg-emerald-600 text-amber-400"'
    expect(countDirectColors(source)).toBe(2)
    expect(countDirectColors(source)).toBe(2)
    expect(countDirectColors(source)).toBe(2)
  })
})

describe("analyzeTokenDrift — Wachstum ist ein Fehler", () => {
  it("meldet eine unbekannte Datei als Fehler", () => {
    const r = analyzeTokenDrift([{ path: "src/neu.tsx", hits: 1 }], EMPTY)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain("src/neu.tsx")
    expect(r.warnings).toHaveLength(0)
  })

  it("meldet mehr Treffer als verzeichnet als Fehler", () => {
    const base: Baseline = { permanent: {}, debt: { "src/a.tsx": 3 } }
    const r = analyzeTokenDrift([{ path: "src/a.tsx", hits: 4 }], base)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain("baseline records 3")
  })

  it("laesst eine dauerhafte Ausnahme nicht wachsen", () => {
    const base: Baseline = {
      permanent: { "src/kind.tsx": { hits: 49, reason: "Taxonomie" } },
      debt: {},
    }
    const r = analyzeTokenDrift([{ path: "src/kind.tsx", hits: 50 }], base)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain("not a licence")
  })
})

describe("analyzeTokenDrift — Fortschritt ist kein Fehler", () => {
  it("meldet weniger Treffer als Warnung, nicht als Fehler", () => {
    const base: Baseline = { permanent: {}, debt: { "src/a.tsx": 5 } }
    const r = analyzeTokenDrift([{ path: "src/a.tsx", hits: 2 }], base)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain("--write")
  })

  it("meldet eine verwaiste Verzeichnung als Warnung und als stale", () => {
    const base: Baseline = { permanent: {}, debt: { "src/weg.tsx": 5 } }
    const r = analyzeTokenDrift([], base)
    expect(r.errors).toHaveLength(0)
    expect(r.stale).toEqual(["src/weg.tsx"])
  })

  it("nennt eine verwaiste dauerhafte Ausnahme ausdruecklich, weil sie sonst spaeter einen echten Fund verdeckt", () => {
    const base: Baseline = {
      permanent: { "src/kind.tsx": { hits: 49, reason: "Taxonomie" } },
      debt: {},
    }
    const r = analyzeTokenDrift([], base)
    expect(r.stale).toEqual(["src/kind.tsx"])
    expect(r.warnings[0]).toContain("hide a real finding")
  })

  it("zaehlt Schuld getrennt von dauerhaften Ausnahmen", () => {
    const base: Baseline = {
      permanent: { "src/kind.tsx": { hits: 49, reason: "Taxonomie" } },
      debt: { "src/a.tsx": 5 },
    }
    const r = analyzeTokenDrift(
      [
        { path: "src/kind.tsx", hits: 49 },
        { path: "src/a.tsx", hits: 5 },
      ],
      base,
    )
    expect(r.totalHits).toBe(54)
    expect(r.debtHits).toBe(5)
    expect(r.errors).toHaveLength(0)
  })
})

describe("nextBaseline — --write senkt nur", () => {
  it("uebernimmt gesunkene Zahlen", () => {
    const base: Baseline = { permanent: {}, debt: { "src/a.tsx": 5 } }
    const { baseline, refusals } = nextBaseline([{ path: "src/a.tsx", hits: 2 }], base)
    expect(refusals).toHaveLength(0)
    expect(baseline.debt["src/a.tsx"]).toBe(2)
  })

  it("verweigert das Anheben — sonst waere --write die Umgehung des ganzen Guards", () => {
    const base: Baseline = { permanent: {}, debt: { "src/a.tsx": 5 } }
    const { baseline, refusals } = nextBaseline([{ path: "src/a.tsx", hits: 9 }], base)
    expect(refusals).toHaveLength(1)
    expect(baseline.debt["src/a.tsx"]).toBe(5)
  })

  it("verweigert das Aufnehmen einer neuen Datei", () => {
    const { baseline, refusals } = nextBaseline([{ path: "src/neu.tsx", hits: 1 }], EMPTY)
    expect(refusals).toHaveLength(1)
    expect(refusals[0]).toContain("new file")
    expect(baseline.debt["src/neu.tsx"]).toBeUndefined()
  })

  it("laesst verwaiste Verzeichnungen fallen", () => {
    const base: Baseline = { permanent: {}, debt: { "src/weg.tsx": 5, "src/a.tsx": 2 } }
    const { baseline } = nextBaseline([{ path: "src/a.tsx", hits: 2 }], base)
    expect(baseline.debt).toEqual({ "src/a.tsx": 2 })
  })

  it("erhaelt die Begruendung einer dauerhaften Ausnahme beim Senken", () => {
    const base: Baseline = {
      permanent: { "src/kind.tsx": { hits: 49, reason: "Taxonomie" } },
      debt: {},
    }
    const { baseline } = nextBaseline([{ path: "src/kind.tsx", hits: 40 }], base)
    expect(baseline.permanent["src/kind.tsx"]).toEqual({ hits: 40, reason: "Taxonomie" })
  })
})
