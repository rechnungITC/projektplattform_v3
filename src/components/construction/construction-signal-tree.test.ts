import { describe, expect, it } from "vitest"

import type { ConstructionSectionSignal } from "@/types/construction-signals"

import { buildSignalSectionRows } from "./construction-signal-tree"

function section(
  id: string,
  parentId: string | null,
  sortOrder: number,
  overrides: Partial<ConstructionSectionSignal> = {}
): ConstructionSectionSignal {
  return {
    section_id: id,
    parent_id: parentId,
    label: id,
    sort_order: sortOrder,
    subtree_depth: 0,
    subtree_truncated: false,
    progress_source: null,
    source_count: 0,
    linked_count: 0,
    progress_percent: null,
    overdue_items: 0,
    phase_linked_count: 0,
    ...overrides,
  }
}

const rowIds = (rows: ReturnType<typeof buildSignalSectionRows>) =>
  rows.map((r) => r.section.section_id)
const rowDepths = (rows: ReturnType<typeof buildSignalSectionRows>) =>
  rows.map((r) => r.depth)

describe("buildSignalSectionRows (PROJ-45-δ)", () => {
  it("stellt Kinder unter ihre Eltern, obwohl die Nutzlast flach sortiert ist", () => {
    // Genau die Reihenfolge, die die Auswertung liefert: `order by sort_order,
    // label` OHNE Rücksicht auf `parent_id`. Das Kind von A trägt sort_order 1
    // und stünde damit VOR der zweiten Wurzel — mit Einrückung, aber ohne
    // seinen Elternteil darüber wäre die Hierarchie falsch gelesen.
    const flat = [
      section("A", null, 1),
      section("A-kind", "A", 1),
      section("B", null, 2),
      section("B-kind", "B", 1),
    ]
    const rows = buildSignalSectionRows(flat)
    expect(rowIds(rows)).toEqual(["A", "A-kind", "B", "B-kind"])
    expect(rowDepths(rows)).toEqual([0, 1, 0, 1])
  })

  it("reiht auch dann korrekt, wenn die Eingabe Eltern und Kinder verschränkt", () => {
    const interleaved = [
      section("B-kind", "B", 1),
      section("A", null, 5),
      section("B", null, 9),
      section("A-kind", "A", 1),
    ]
    expect(rowIds(buildSignalSectionRows(interleaved))).toEqual([
      "A",
      "A-kind",
      "B",
      "B-kind",
    ])
  })

  it("leitet die Tiefe aus parent_id ab und NICHT aus subtree_depth", () => {
    // `subtree_depth` ist die HÖHE des Teilbaums unter dem Abschnitt. Hier
    // bewusst gegenläufig belegt: die Wurzel trägt 2, das Enkelkind 0. Wer
    // `subtree_depth` einrückt, erhält [2, 1, 0] — genau invertiert.
    const rows = buildSignalSectionRows([
      section("wurzel", null, 1, { subtree_depth: 2 }),
      section("kind", "wurzel", 1, { subtree_depth: 1 }),
      section("enkel", "kind", 1, { subtree_depth: 0 }),
    ])
    expect(rowIds(rows)).toEqual(["wurzel", "kind", "enkel"])
    expect(rowDepths(rows)).toEqual([0, 1, 2])
    expect(rowDepths(rows)).not.toEqual(
      rows.map((r) => r.section.subtree_depth)
    )
  })

  it("sortiert Geschwister nach sort_order, dann nach Bezeichnung (deutsch)", () => {
    const rows = buildSignalSectionRows([
      section("Zebra", null, 1),
      section("Ähre", null, 1),
      section("Beta", null, 0),
    ])
    // Gleiche sort_order → Bezeichnung mit deutscher Kollation: "Ähre" vor "Zebra".
    expect(rowIds(rows)).toEqual(["Beta", "Ähre", "Zebra"])
  })

  it("hebt Waisen auf Wurzelebene statt sie zu verlieren", () => {
    // Der Elternteil ist nicht in der Liste (etwa weil die RLS ihn verbirgt).
    // Die Zeile trägt Blocker- und Überfälligkeitszahlen — sie darf nicht
    // stillschweigend verschwinden.
    const rows = buildSignalSectionRows([
      section("waise", "nicht-in-der-liste", 1, { overdue_items: 3 }),
      section("wurzel", null, 2),
    ])
    expect(rowIds(rows)).toEqual(["waise", "wurzel"])
    expect(rowDepths(rows)).toEqual([0, 0])
  })

  it("verliert bei einem Zyklus in parent_id keine Zeile und läuft nicht endlos", () => {
    const rows = buildSignalSectionRows([
      section("A", "B", 1),
      section("B", "A", 2),
      section("frei", null, 3),
    ])
    expect(rowIds(rows).sort()).toEqual(["A", "B", "frei"])
  })

  it("gibt für eine leere Liste eine leere Liste zurück", () => {
    expect(buildSignalSectionRows([])).toEqual([])
  })
})
