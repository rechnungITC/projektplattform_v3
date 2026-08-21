import type {
  DdFinding,
  DdFindingsSummaryRow,
  FindingSeverity,
} from "@/lib/ma-project/dd-findings-api"

/**
 * PROJ-Y-2 — Red-Flag-Lens auf dem DD-Findings-Panel (FE-only).
 *
 * Ein „Red Flag" ist in diesem Datenmodell kein eigenes Konzept, sondern ein
 * hochsevere(s) `dd_finding` — so hat die CIA-Review 2026-06-26 PROJ-108 durch
 * das deployte PROJ-114 abgelöst. Die Definition darf deshalb **nicht** hier neu
 * erfunden werden: sie ist die WHERE-Klausel des bereits deployten
 * `dd_report_consolidated` (PROJ-116, Live-Definition am 2026-08-17 gelesen):
 *
 *   where f.project_id = p_project_id and f.severity in ('hoch','deal_breaker')
 *   order by (f.severity = 'deal_breaker') desc, f.economic_impact_eur desc nulls last
 *
 * Beachte: **kein Status-Filter.** Ein erledigter oder verworfener Befund bleibt
 * im Red-Flag-Report gelistet. Die Lens hier zeigt bewusst dieselbe Menge in
 * derselben Reihenfolge — zwei auseinanderlaufende Lesarten von „Red Flag"
 * wären der eigentliche Schaden, sobald jemand die SteerCo-Zahl dieser Fläche
 * gegen den DD-Bericht hält.
 */

/** Die Schwellen-Schweregrade — eine Quelle, aus der das Prädikat abgeleitet wird. */
export const RED_FLAG_SEVERITIES: readonly FindingSeverity[] = ["hoch", "deal_breaker"]

export function isRedFlagSeverity(severity: FindingSeverity): boolean {
  return RED_FLAG_SEVERITIES.includes(severity)
}

/**
 * PostgREST liefert `numeric` je nach Wert als Zahl **oder** als String; `bigint`
 * ebenso. Ohne Coercion würde `+` zwei Strings verketten und die EUR-Summe wäre
 * grotesk falsch (das bestehende Panel coercet an seiner Summenstelle aus
 * demselben Grund). Nicht-Zahlen fallen auf 0 zurück statt NaN zu streuen.
 */
function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export interface FindingTotals {
  /** Anzahl Findings — aus dem Aggregat, also unbeschränkt (die Listen-Route deckelt bei 500). */
  count: number
  /** Summe der EUR-Schätzungen. Findings ohne Schätzung sind darin **nicht** enthalten. */
  eurSum: number
  /** Findings ohne EUR-Schätzung. Ohne diese Zahl ist die Summe nicht ehrlich lesbar. */
  nullEurCount: number
}

export interface RedFlagTotals extends FindingTotals {
  dealBreakerCount: number
}

function aggregate(
  rows: readonly DdFindingsSummaryRow[],
  keep: (row: DdFindingsSummaryRow) => boolean
): FindingTotals {
  return rows.reduce<FindingTotals>(
    (acc, row) => {
      if (!keep(row)) return acc
      return {
        count: acc.count + num(row.finding_count),
        eurSum: acc.eurSum + num(row.eur_sum),
        nullEurCount: acc.nullEurCount + num(row.null_eur_count),
      }
    },
    { count: 0, eurSum: 0, nullEurCount: 0 }
  )
}

/**
 * Kennzahlen über **alle** sichtbaren Findings, gespeist aus
 * `dd_findings_summary` — einer `SECURITY INVOKER`-Auswertung, auf die die
 * Need-to-know-Policies des Aufrufers angewandt werden. Eine Summe über
 * gegatete Zeilen wäre ein Leck, auch wenn die Zeilenliste korrekt verborgen ist.
 */
export function findingTotals(rows: readonly DdFindingsSummaryRow[]): FindingTotals {
  return aggregate(rows, () => true)
}

/** Dieselben Kennzahlen, auf die Red-Flag-Schweregrade eingeschränkt. */
export function redFlagTotals(rows: readonly DdFindingsSummaryRow[]): RedFlagTotals {
  return {
    ...aggregate(rows, (row) => isRedFlagSeverity(row.severity)),
    dealBreakerCount: aggregate(rows, (row) => row.severity === "deal_breaker").count,
  }
}

/** Sortierbares Minimum — hält den Vergleich testbar ohne eine ganze Finding-Zeile. */
export type RedFlagSortable = Pick<DdFinding, "severity" | "economic_impact_eur">

/**
 * Reihenfolge des deployten Red-Flag-Reports: Deal Breaker zuerst, dann nach
 * EUR absteigend, Findings ohne Schätzung zuletzt.
 */
export function compareRedFlags(a: RedFlagSortable, b: RedFlagSortable): number {
  const aDeal = a.severity === "deal_breaker" ? 1 : 0
  const bDeal = b.severity === "deal_breaker" ? 1 : 0
  if (aDeal !== bDeal) return bDeal - aDeal

  const aNull = a.economic_impact_eur === null || a.economic_impact_eur === undefined
  const bNull = b.economic_impact_eur === null || b.economic_impact_eur === undefined
  if (aNull !== bNull) return aNull ? 1 : -1
  if (aNull && bNull) return 0

  return num(b.economic_impact_eur) - num(a.economic_impact_eur)
}

export type FindingsLens = "all" | "red_flags"

/**
 * Wendet die Lens auf die geladenen Zeilen an. `all` lässt die Reihenfolge der
 * Route unberührt (neueste zuerst); `red_flags` filtert und sortiert wie der
 * deployte Report, damit beide Flächen dieselbe Liste in derselben Ordnung zeigen.
 */
export function applyFindingsLens(
  findings: readonly DdFinding[],
  lens: FindingsLens
): DdFinding[] {
  if (lens === "all") return [...findings]
  return findings.filter((f) => isRedFlagSeverity(f.severity)).sort(compareRedFlags)
}
