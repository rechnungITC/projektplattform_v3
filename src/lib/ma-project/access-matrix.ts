/**
 * PROJ-100b (Open Question 3 / "Later") — project-wide "who can see what?"
 * matrix. Pivots the three per-level `ma_access_explain` responses
 * (standard / confidential / strict) into one user × level grid.
 *
 * Gate-faithful by construction: every cell comes straight from the
 * server-side `can_access_classified` predicate (via `ma_access_explain`),
 * so there is NO client-side second gate — this module only re-shapes the
 * server's answers, it never decides access itself.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

import type { AccessExplainEntry, AccessReason } from "./advisor-nda-api"

export const MATRIX_LEVELS: readonly MaConfidentialityLevel[] = [
  "standard",
  "confidential",
  "strict",
] as const

const LEVEL_RANK: Record<MaConfidentialityLevel, number> = {
  standard: 0,
  confidential: 1,
  strict: 2,
}

export interface AccessMatrixRow {
  user_id: string
  /** Whether the gate lets this user see an object classified at each level. */
  access: Record<MaConfidentialityLevel, boolean>
  /** Highest level the user can access, or null if none. */
  max_level: MaConfidentialityLevel | null
  /**
   * Reason for the user's highest accessible level (positive story:
   * admin / cleared / baseline). When the user can see nothing, falls back
   * to the lowest-level reason explaining why (e.g. nda_missing).
   */
  reason: AccessReason
  is_external_advisor: boolean
}

interface MutableRow {
  user_id: string
  access: Record<MaConfidentialityLevel, boolean>
  reasonByLevel: Partial<Record<MaConfidentialityLevel, AccessReason>>
  is_external_advisor: boolean
}

/**
 * Build the user × level matrix from the per-level access-explain responses.
 * Rows are sorted by highest accessible level (strict first), then user_id,
 * so the most-privileged users surface at the top of the grid.
 */
export function buildAccessMatrix(
  perLevel: Partial<Record<MaConfidentialityLevel, AccessExplainEntry[]>>
): AccessMatrixRow[] {
  const rows = new Map<string, MutableRow>()

  for (const level of MATRIX_LEVELS) {
    for (const entry of perLevel[level] ?? []) {
      let row = rows.get(entry.user_id)
      if (!row) {
        row = {
          user_id: entry.user_id,
          access: { standard: false, confidential: false, strict: false },
          reasonByLevel: {},
          is_external_advisor: false,
        }
        rows.set(entry.user_id, row)
      }
      row.access[level] = entry.has_access
      row.reasonByLevel[level] = entry.reason
      if (entry.is_external_advisor) row.is_external_advisor = true
    }
  }

  const result: AccessMatrixRow[] = []
  for (const row of rows.values()) {
    let maxLevel: MaConfidentialityLevel | null = null
    for (const level of MATRIX_LEVELS) {
      if (row.access[level]) maxLevel = level
    }
    const reason: AccessReason = maxLevel
      ? (row.reasonByLevel[maxLevel] ?? "baseline")
      : (row.reasonByLevel.standard ??
        row.reasonByLevel.confidential ??
        row.reasonByLevel.strict ??
        "no_clearance")
    result.push({
      user_id: row.user_id,
      access: row.access,
      max_level: maxLevel,
      reason,
      is_external_advisor: row.is_external_advisor,
    })
  }

  result.sort((a, b) => {
    const ra = a.max_level ? LEVEL_RANK[a.max_level] + 1 : 0
    const rb = b.max_level ? LEVEL_RANK[b.max_level] + 1 : 0
    if (ra !== rb) return rb - ra
    return a.user_id.localeCompare(b.user_id)
  })

  return result
}