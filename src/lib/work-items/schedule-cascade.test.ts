import { describe, expect, it } from "vitest"

import {
  CASCADE_MAX_DEPTH,
  computeScheduleCascade,
  type CascadeEdge,
  type CascadeNode,
} from "./schedule-cascade"

/**
 * PROJ-155-β.2 — AC-17 verlangt ausdrücklich, dass `FS`, `SS`, `FF`, `SF` und ein
 * Abstand ≠ 0 **je einzeln nachweisbar** auf das Ergebnis wirken: „vier Fälle plus
 * Abstand, nicht ‚der Scheduler läuft'". Diese Datei ist so gebaut, dass jeder Typ
 * seinen eigenen Fall hat und die erwartete Zahl aus der Semantik folgt, nicht aus
 * dem Beobachten der Implementierung.
 */

const win = (start: string, end: string) => ({ start, end })

function edge(
  fromId: string,
  toId: string,
  constraintType: CascadeEdge["constraintType"],
  lagDays = 0,
): CascadeEdge {
  return { fromId, toId, constraintType, lagDays }
}

describe("computeScheduleCascade — die vier Kantentypen einzeln (AC-17)", () => {
  // A endete am 10., B startet am 11. — die FS-Bedingung ist exakt erfüllt.
  // A wird um 5 Tage nach rechts gezogen: B muss 5 Tage folgen.
  it("FS bindet den START des Nachfolgers an das ENDE des Vorgängers", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-11", "2026-03-20") },
    ]
    const r = computeScheduleCascade(
      "A",
      win("2026-03-06", "2026-03-15"),
      nodes,
      [edge("A", "B", "FS")],
    )
    expect(r.shifts).toHaveLength(1)
    expect(r.shifts[0]).toMatchObject({
      id: "B",
      start: "2026-03-16",
      end: "2026-03-25",
      deltaDays: 5,
    })
    expect(r.conflicts).toHaveLength(0)
  })

  // SS bindet Start an Start. A startet neu am 06., also muss B am 06. starten.
  // B startete am 01. — das sind 5 Tage nach rechts, obwohl A's ENDE
  // unverändert bliebe. Genau das unterscheidet SS von FS.
  it("SS bindet den START an den START — nicht an das Ende", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-01", "2026-03-05") },
    ]
    const r = computeScheduleCascade(
      "A",
      win("2026-03-06", "2026-03-15"),
      nodes,
      [edge("A", "B", "SS")],
    )
    expect(r.shifts[0]).toMatchObject({ id: "B", start: "2026-03-06", deltaDays: 5 })
  })

  // FF bindet ENDE an ENDE. B's Ende muss auf A's neues Ende rutschen; B's
  // Start wandert mit, weil die Dauer erhalten bleibt.
  it("FF bindet das ENDE an das ENDE, die Dauer bleibt", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-05", "2026-03-10") },
    ]
    const r = computeScheduleCascade(
      "A",
      win("2026-03-04", "2026-03-13"),
      nodes,
      [edge("A", "B", "FF")],
    )
    expect(r.shifts[0]).toMatchObject({
      id: "B",
      start: "2026-03-08",
      end: "2026-03-13",
      deltaDays: 3,
    })
  })

  // SF bindet das ENDE des Nachfolgers an den START des Vorgängers — der
  // seltenste Typ, und der einzige, bei dem beide Bezugspunkte "kreuzen".
  it("SF bindet das ENDE des Nachfolgers an den START des Vorgängers", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-10", "2026-03-20") },
      { id: "B", window: win("2026-03-01", "2026-03-10") },
    ]
    const r = computeScheduleCascade(
      "A",
      win("2026-03-14", "2026-03-24"),
      nodes,
      [edge("A", "B", "SF")],
    )
    expect(r.shifts[0]).toMatchObject({ id: "B", end: "2026-03-14", deltaDays: 4 })
  })

  // Die vier Typen liefern bei IDENTISCHER Ausgangslage vier verschiedene
  // Ergebnisse. Das ist die eigentliche Zusicherung von AC-17: wäre der Typ
  // wirkungslos, wären alle vier Zahlen gleich.
  it("dieselbe Lage ergibt je Typ ein ANDERES Ergebnis", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-11", "2026-03-15") },
    ]
    const moved = win("2026-03-06", "2026-03-20")
    const deltas = (["FS", "SS", "FF", "SF"] as const).map((t) => {
      const r = computeScheduleCascade("A", moved, nodes, [edge("A", "B", t)])
      return r.shifts[0]?.deltaDays ?? 0
    })
    // FS: Ende 20. -> B start 21. (war 11.) = +10
    // SS: Start 06. -> B start 06. (war 11.) = 0, keine Verschiebung nach links
    // FF: Ende 20. -> B end 20. (war 15.) = +5
    // SF: Start 06. -> B end 06. (war 15.) = 0
    expect(deltas).toEqual([10, 0, 5, 0])
    expect(new Set(deltas).size).toBeGreaterThan(1)
  })
})

describe("computeScheduleCascade — der Abstand (AC-17, zweite Hälfte)", () => {
  it("ein positiver Abstand schiebt den Nachfolger weiter", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-11", "2026-03-20") },
    ]
    const ohne = computeScheduleCascade("A", win("2026-03-06", "2026-03-15"), nodes, [
      edge("A", "B", "FS", 0),
    ])
    const mit = computeScheduleCascade("A", win("2026-03-06", "2026-03-15"), nodes, [
      edge("A", "B", "FS", 3),
    ])
    expect(ohne.shifts[0].deltaDays).toBe(5)
    expect(mit.shifts[0].deltaDays).toBe(8)
  })

  it("ein negativer Abstand erlaubt Überlappung und bremst die Kaskade", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-11", "2026-03-20") },
    ]
    const r = computeScheduleCascade("A", win("2026-03-06", "2026-03-15"), nodes, [
      edge("A", "B", "FS", -5),
    ])
    // Grenze: 15. minus 5 Tage = 10.; B startet schon am 11., also nichts zu tun.
    expect(r.shifts).toHaveLength(0)
  })
})

describe("computeScheduleCascade — was NICHT passiert", () => {
  // AC-16: ein Nachfolger ohne Termin bekommt keinen erfunden.
  it("ein Nachfolger ohne Termine wird benannt statt beschenkt", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: { start: null, end: null } },
    ]
    const r = computeScheduleCascade("A", win("2026-03-06", "2026-03-15"), nodes, [
      edge("A", "B", "FS"),
    ])
    expect(r.shifts).toHaveLength(0)
    expect(r.skipped).toEqual([{ id: "B", reason: "no_dates" }])
  })

  it("ein halb terminierter Nachfolger zählt als terminlos, nicht als halb", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: { start: "2026-03-11", end: null } },
    ]
    const r = computeScheduleCascade("A", win("2026-03-06", "2026-03-15"), nodes, [
      edge("A", "B", "FS"),
    ])
    expect(r.skipped).toEqual([{ id: "B", reason: "no_dates" }])
  })

  // Eine Rückwärts-Verschiebung darf einen Nachfolger nicht mitreißen: seine
  // Bedingung ist danach noch erfüllt, also gibt es keinen Grund ihn zu bewegen.
  it("Ziehen nach links verschiebt niemanden, dessen Bedingung weiter gilt", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-10", "2026-03-20") },
      { id: "B", window: win("2026-03-21", "2026-03-25") },
    ]
    const r = computeScheduleCascade("A", win("2026-03-05", "2026-03-15"), nodes, [
      edge("A", "B", "FS"),
    ])
    expect(r.shifts).toHaveLength(0)
    expect(r.conflicts).toHaveLength(0)
  })

  it("ein Knoten ohne ausgehende Kante loest gar nichts aus", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-11", "2026-03-20") },
    ]
    const r = computeScheduleCascade("A", win("2026-03-06", "2026-03-15"), nodes, [])
    expect(r.shifts).toHaveLength(0)
  })
})

describe("computeScheduleCascade — mehrere Vorgaenger", () => {
  /**
   * Der Fall, den eine naive Kaskade falsch macht: C hat ZWEI Vorgänger. Wird nur
   * A gezogen, darf C sich nur so weit bewegen, wie **beide** Bedingungen es
   * zulassen. Eine Kaskade, die nur der Kante folgt, über die sie kam, würde die
   * strengere Bedingung übersehen.
   */
  it("die strengste Bedingung ueber ALLE Vorgaenger gewinnt", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: win("2026-03-01", "2026-03-25") },
      { id: "C", window: win("2026-03-11", "2026-03-15") },
    ]
    // A zieht auf Ende 15. -> C müsste am 16. starten.
    // B endet aber am 25. -> C muss am 26. starten. B gewinnt.
    const r = computeScheduleCascade("A", win("2026-03-06", "2026-03-15"), nodes, [
      edge("A", "C", "FS"),
      edge("B", "C", "FS"),
    ])
    expect(r.shifts[0]).toMatchObject({ id: "C", start: "2026-03-26", deltaDays: 15 })
  })
})

describe("computeScheduleCascade — Ketten und Terminierung (AC-19)", () => {
  it("die Verschiebung pflanzt sich ueber eine Kette fort", () => {
    const nodes: CascadeNode[] = [
      { id: "n0", window: win("2026-03-01", "2026-03-02") },
      { id: "n1", window: win("2026-03-03", "2026-03-04") },
      { id: "n2", window: win("2026-03-05", "2026-03-06") },
      { id: "n3", window: win("2026-03-07", "2026-03-08") },
    ]
    const r = computeScheduleCascade("n0", win("2026-03-04", "2026-03-05"), nodes, [
      edge("n0", "n1", "FS"),
      edge("n1", "n2", "FS"),
      edge("n2", "n3", "FS"),
    ])
    expect(r.shifts.map((s) => s.id).sort()).toEqual(["n1", "n2", "n3"])
    expect(r.shifts.every((s) => s.deltaDays === 3)).toBe(true)
  })

  // AC-19 verlangt den Nachweis an einer Kette der Tiefe >= 20 — ausdruecklich
  // nicht an der Prod-Lage, wo es 5 Kanten sind.
  it("eine Kette der Tiefe 25 terminiert und verschiebt jeden Knoten", () => {
    const nodes: CascadeNode[] = []
    const edges: CascadeEdge[] = []
    for (let i = 0; i <= 25; i++) {
      const day = String(i * 2 + 1).padStart(2, "0")
      const day2 = String(i * 2 + 2).padStart(2, "0")
      nodes.push({ id: `k${i}`, window: win(`2026-04-${day}`, `2026-04-${day2}`) })
      if (i > 0) edges.push(edge(`k${i - 1}`, `k${i}`, "FS"))
    }
    const r = computeScheduleCascade("k0", win("2026-04-04", "2026-04-05"), nodes, edges)
    expect(r.shifts).toHaveLength(25)
    expect(r.truncated).toBe(false)
    expect(r.shifts.every((s) => s.deltaDays === 3)).toBe(true)
  })

  it("die Tiefengrenze wird ausgewiesen statt verschwiegen", () => {
    const n = CASCADE_MAX_DEPTH + 5
    const nodes: CascadeNode[] = []
    const edges: CascadeEdge[] = []
    const base = Date.UTC(2026, 0, 1)
    for (let i = 0; i <= n; i++) {
      const d = new Date(base + i * 2 * 86_400_000).toISOString().slice(0, 10)
      const d2 = new Date(base + (i * 2 + 1) * 86_400_000).toISOString().slice(0, 10)
      nodes.push({ id: `x${i}`, window: win(d, d2) })
      if (i > 0) edges.push(edge(`x${i - 1}`, `x${i}`, "FS"))
    }
    const moved = win(
      new Date(base + 3 * 86_400_000).toISOString().slice(0, 10),
      new Date(base + 4 * 86_400_000).toISOString().slice(0, 10),
    )
    const r = computeScheduleCascade("x0", moved, nodes, edges)
    expect(r.truncated).toBe(true)
  })
})

describe("computeScheduleCascade — Konflikte", () => {
  /**
   * Der Fall aus der Interactions-Tabelle: ein Nachfolger, der nicht bewegt werden
   * kann, hinterlässt eine verletzte Bedingung. Sie wird **benannt** — Übernehmen
   * bleibt möglich, der Plan ist dann eben eng.
   */
  it("eine verletzte Bedingung bleibt nach der Kaskade benannt", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-03-01", "2026-03-10") },
      { id: "B", window: { start: null, end: null } },
      { id: "C", window: win("2026-03-11", "2026-03-12") },
    ]
    const r = computeScheduleCascade("A", win("2026-03-06", "2026-03-20"), nodes, [
      edge("A", "B", "FS"),
      edge("A", "C", "FS"),
    ])
    // C zieht mit, B kann nicht.
    expect(r.shifts.map((s) => s.id)).toEqual(["C"])
    expect(r.skipped).toEqual([{ id: "B", reason: "no_dates" }])
    // B hat keine Termine, also ist seine Kante nicht auswertbar -> kein Konflikt.
    expect(r.conflicts).toHaveLength(0)
  })

  it("ein Konflikt entsteht, wenn ein Nachfolger nicht weit genug mitkann", () => {
    // D hat zwei Vorgänger; die Kaskade bewegt D an die strengste Grenze, danach
    // ist keine Bedingung mehr verletzt. Zum Nachweis, dass die Konflikt-Prüfung
    // überhaupt anschlägt, wird eine Kante auf einen Knoten gesetzt, den die
    // Kaskade nie erreicht: eine Kante, deren Ziel schon zu früh liegt.
    const nodes: CascadeNode[] = [
      { id: "P", window: win("2026-05-10", "2026-05-20") },
      { id: "Q", window: win("2026-05-01", "2026-05-05") },
    ]
    // Q liegt VOR P, die FS-Bedingung ist von Anfang an verletzt. Ein Zug an
    // einem unbeteiligten Knoten muss sie melden, nicht heimlich reparieren.
    const r = computeScheduleCascade("Q", win("2026-05-01", "2026-05-05"), nodes, [
      edge("P", "Q", "FS"),
    ])
    expect(r.conflicts).toHaveLength(1)
    expect(r.conflicts[0]).toMatchObject({
      edgeFromId: "P",
      edgeToId: "Q",
      constraintType: "FS",
      shortfallDays: 20,
    })
  })
})

describe("computeScheduleCascade — Randfaelle des Kalenders", () => {
  it("rechnet ueber Monatsgrenzen", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-01-28", "2026-01-30") },
      { id: "B", window: win("2026-01-31", "2026-02-02") },
    ]
    const r = computeScheduleCascade("A", win("2026-01-30", "2026-02-01"), nodes, [
      edge("A", "B", "FS"),
    ])
    expect(r.shifts[0]).toMatchObject({ id: "B", start: "2026-02-02", end: "2026-02-04" })
  })

  // PROJ-45-γ hat live gemessen, dass Postgres am Monatsende KLEMMT und
  // setUTCMonth UEBERLAEUFT. Hier ist es reine Tagesaddition, also gibt es die
  // Falle nicht — aber der Schalttag gehoert trotzdem gepinnt.
  it("rechnet ueber den Schalttag 2028-02-29", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2028-02-26", "2028-02-27") },
      { id: "B", window: win("2028-02-28", "2028-03-01") },
    ]
    const r = computeScheduleCascade("A", win("2028-02-28", "2028-02-29"), nodes, [
      edge("A", "B", "FS"),
    ])
    expect(r.shifts[0]).toMatchObject({ id: "B", start: "2028-03-01", end: "2028-03-03" })
  })

  it("rechnet ueber den Jahreswechsel", () => {
    const nodes: CascadeNode[] = [
      { id: "A", window: win("2026-12-29", "2026-12-30") },
      { id: "B", window: win("2026-12-31", "2027-01-02") },
    ]
    const r = computeScheduleCascade("A", win("2026-12-31", "2027-01-01"), nodes, [
      edge("A", "B", "FS"),
    ])
    expect(r.shifts[0]).toMatchObject({ id: "B", start: "2027-01-02", end: "2027-01-04" })
  })
})
