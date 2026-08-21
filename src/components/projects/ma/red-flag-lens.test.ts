import { describe, expect, it } from "vitest"

import type {
  DdFinding,
  DdFindingsSummaryRow,
  FindingSeverity,
  FindingStatus,
} from "@/lib/ma-project/dd-findings-api"

import {
  applyFindingsLens,
  compareRedFlags,
  findingTotals,
  isRedFlagSeverity,
  RED_FLAG_SEVERITIES,
  redFlagTotals,
} from "./red-flag-lens"

const ALL_SEVERITIES: FindingSeverity[] = ["niedrig", "mittel", "hoch", "deal_breaker"]

function row(
  severity: FindingSeverity,
  overrides: Partial<DdFindingsSummaryRow> = {}
): DdFindingsSummaryRow {
  return {
    dd_stream_id: "11111111-1111-4111-8111-111111111111",
    severity,
    finding_count: 1,
    eur_sum: 0,
    null_eur_count: 0,
    ...overrides,
  }
}

function finding(
  id: string,
  severity: FindingSeverity,
  economic_impact_eur: number | null,
  status: FindingStatus = "open"
): DdFinding {
  return {
    id,
    tenant_id: "22222222-2222-4222-8222-222222222222",
    project_id: "33333333-3333-4333-8333-333333333333",
    dd_stream_id: "11111111-1111-4111-8111-111111111111",
    title: `Finding ${id}`,
    description: null,
    severity,
    economic_impact_eur,
    probability: null,
    recommended_treatment: null,
    status,
    linked_risk_id: null,
    responsible_user_id: null,
    confidentiality_level: "standard",
    // PROJ-Y-114a hat die drei Herkunftsfelder als Pflichtfelder ergaenzt; die
    // Linse (PROJ-Y-2) filtert nach Schwere und liest sie nicht.
    source_kind: null,
    source_ref: null,
    source_dd_question_id: null,
    created_by: null,
    created_at: "2026-08-17T10:00:00Z",
    updated_at: "2026-08-17T10:00:00Z",
  }
}

describe("isRedFlagSeverity — Parität mit dem deployten dd_report_consolidated", () => {
  // Die RPC filtert `f.severity in ('hoch','deal_breaker')`. Erschöpfend über alle
  // vier Schweregrade geprüft, damit ein künftiger fünfter Wert eine Entscheidung
  // erzwingt statt still durch- oder herauszufallen.
  it.each(ALL_SEVERITIES)("stuft %s korrekt ein", (severity) => {
    const expected = severity === "hoch" || severity === "deal_breaker"
    expect(isRedFlagSeverity(severity)).toBe(expected)
  })

  it("führt genau die zwei Schweregrade der RPC-WHERE-Klausel", () => {
    expect([...RED_FLAG_SEVERITIES].sort()).toEqual(["deal_breaker", "hoch"])
  })
})

describe("Kennzahlen aus dem INVOKER-Aggregat", () => {
  const rows: DdFindingsSummaryRow[] = [
    row("niedrig", { finding_count: 4, eur_sum: 1_000, null_eur_count: 1 }),
    row("mittel", { finding_count: 3, eur_sum: 5_000, null_eur_count: 0 }),
    row("hoch", { finding_count: 2, eur_sum: 250_000, null_eur_count: 1 }),
    row("deal_breaker", { finding_count: 1, eur_sum: 900_000, null_eur_count: 2 }),
  ]

  it("summiert über alle Schweregrade", () => {
    expect(findingTotals(rows)).toEqual({
      count: 10,
      eurSum: 1_156_000,
      nullEurCount: 4,
    })
  })

  it("beschränkt die Red-Flag-Summe auf hoch + deal_breaker", () => {
    expect(redFlagTotals(rows)).toEqual({
      count: 3,
      eurSum: 1_150_000,
      nullEurCount: 3,
      dealBreakerCount: 1,
    })
  })

  it("liefert Nullwerte für ein leeres Aggregat", () => {
    expect(redFlagTotals([])).toEqual({
      count: 0,
      eurSum: 0,
      nullEurCount: 0,
      dealBreakerCount: 0,
    })
  })

  // PostgREST gibt `numeric`/`bigint` je nach Wert als String zurück. Ohne
  // Coercion würde `+` verketten: "250000" + "900000" = "250000900000".
  it("coercet numeric-als-String statt zu verketten", () => {
    const stringy = [
      row("hoch", {
        finding_count: "2" as unknown as number,
        eur_sum: "250000" as unknown as number,
        null_eur_count: "1" as unknown as number,
      }),
      row("deal_breaker", {
        finding_count: "1" as unknown as number,
        eur_sum: "900000" as unknown as number,
        null_eur_count: "0" as unknown as number,
      }),
    ]
    expect(redFlagTotals(stringy)).toEqual({
      count: 3,
      eurSum: 1_150_000,
      nullEurCount: 1,
      dealBreakerCount: 1,
    })
  })
})

describe("compareRedFlags — Reihenfolge des deployten Reports", () => {
  it("stellt Deal Breaker vor hohe Befunde, auch bei kleinerem EUR-Wert", () => {
    const sorted = [
      finding("hoch-gross", "hoch", 900_000),
      finding("db-klein", "deal_breaker", 1),
    ].sort(compareRedFlags)
    expect(sorted.map((f) => f.id)).toEqual(["db-klein", "hoch-gross"])
  })

  it("sortiert innerhalb einer Schwere nach EUR absteigend", () => {
    const sorted = [
      finding("b", "hoch", 100),
      finding("a", "hoch", 500),
      finding("c", "hoch", 250),
    ].sort(compareRedFlags)
    expect(sorted.map((f) => f.id)).toEqual(["a", "c", "b"])
  })

  it("hängt Findings ohne EUR-Schätzung hinten an (nulls last)", () => {
    const sorted = [
      finding("ohne", "hoch", null),
      finding("mit", "hoch", 1),
    ].sort(compareRedFlags)
    expect(sorted.map((f) => f.id)).toEqual(["mit", "ohne"])
  })
})

describe("applyFindingsLens", () => {
  const findings = [
    finding("n", "niedrig", 10),
    finding("m", "mittel", 20),
    finding("h", "hoch", 30),
    finding("db", "deal_breaker", null),
  ]

  it("lässt die Reihenfolge der Route bei 'all' unberührt", () => {
    expect(applyFindingsLens(findings, "all").map((f) => f.id)).toEqual([
      "n",
      "m",
      "h",
      "db",
    ])
  })

  it("filtert bei 'red_flags' auf hoch + deal_breaker und sortiert wie der Report", () => {
    expect(applyFindingsLens(findings, "red_flags").map((f) => f.id)).toEqual(["db", "h"])
  })

  // Die RPC hat KEINEN Status-Filter — ein erledigter Deal Breaker bleibt im
  // Red-Flag-Report. Würde die Lens hier „nur offene" zeigen, liefen die
  // SteerCo-Zahl dieser Fläche und der DD-Bericht auseinander.
  it("blendet erledigte und verworfene Red Flags NICHT aus", () => {
    const mixed = [
      finding("erledigt", "deal_breaker", 5, "resolved"),
      finding("verworfen", "hoch", 4, "dismissed"),
      finding("offen", "hoch", 3, "open"),
    ]
    expect(applyFindingsLens(mixed, "red_flags").map((f) => f.id)).toEqual([
      "erledigt",
      "verworfen",
      "offen",
    ])
  })

  it("mutiert die Eingabe nicht", () => {
    const input = [...findings]
    applyFindingsLens(input, "red_flags")
    expect(input.map((f) => f.id)).toEqual(["n", "m", "h", "db"])
  })
})
