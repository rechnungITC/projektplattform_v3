/**
 * PROJ-22 — pure traffic-light helper.
 *
 * Mirrors the SQL CASE in the `budget_item_totals` view so the frontend can
 * derive the same color when it has only the raw numbers (e.g. after a
 * fresh INSERT before the view round-trip refreshes).
 *
 * Rules (locked in /architecture, decision 5):
 *   green  — actual / planned <  0.90  OR  planned == 0
 *   yellow — actual / planned in [0.90, 1.00]
 *   red    — actual / planned >  1.00
 *
 * `actual` here is already net of reversals — the engine subtracts reversal
 * amounts before calling this function.
 */

import type { TrafficLightState } from "@/types/budget"

export function deriveTrafficLight(
  plannedAmount: number,
  actualAmount: number
): TrafficLightState {
  if (plannedAmount <= 0) return "green"
  const ratio = actualAmount / plannedAmount
  if (ratio > 1.0) return "red"
  if (ratio >= 0.9) return "yellow"
  return "green"
}
