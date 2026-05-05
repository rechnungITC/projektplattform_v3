/**
 * Drift detection: compares parsed SELECT calls against a column dump.
 *
 * The contract is intentionally narrow:
 *   - Wildcard SELECTs are skipped (they cannot drift by definition).
 *   - Dynamic SELECTs (template literals) are skipped with a notice.
 *   - Embedded relations are NOT validated in the α-slice — they're
 *     reported alongside the parent call but not column-checked.
 *   - For every static SELECT, every column must exist in the dumped
 *     `information_schema.columns` for the named table. Missing columns
 *     produce a Drift entry.
 */

import { parseSelect } from "./select-parser"
import type { SelectCall } from "./ast-walker"

/**
 * SchemaDump = Map<table, Set<column>>. Built by shadow-db.ts from
 * `information_schema.columns`.
 */
export type SchemaDump = Map<string, Set<string>>

export interface Drift {
  file: string
  line: number
  table: string
  missingColumns: string[]
  /** Available columns in the table (for the report's "did you mean" hint). */
  availableColumns: string[]
}

export interface SkippedCall {
  file: string
  line: number
  reason: string
}

export interface DiffResult {
  drifts: Drift[]
  skipped: SkippedCall[]
  validatedCalls: number
}

export function diffCalls(
  calls: SelectCall[],
  schema: SchemaDump
): DiffResult {
  const drifts: Drift[] = []
  const skipped: SkippedCall[] = []
  let validatedCalls = 0

  for (const call of calls) {
    if (call.dynamic) {
      skipped.push({
        file: call.file,
        line: call.line,
        reason: call.dynamicReason ?? "dynamic call",
      })
      continue
    }
    if (call.table === null || call.rawSelect === null) {
      // Belt-and-braces: dynamic flag and null inputs should match.
      skipped.push({
        file: call.file,
        line: call.line,
        reason: "table or select missing",
      })
      continue
    }

    const parsed = parseSelect(call.rawSelect)
    if (parsed.kind === "wildcard") {
      validatedCalls += 1
      continue
    }

    const columns = schema.get(call.table)
    if (columns === undefined) {
      // Table not in schema dump. Could be:
      //   1. View / materialized view (we don't dump those).
      //   2. Auth-schema table referenced via from("auth.users") etc.
      //   3. A typo. Best to flag rather than silently pass.
      drifts.push({
        file: call.file,
        line: call.line,
        table: call.table,
        missingColumns: parsed.columns,
        availableColumns: [],
      })
      continue
    }

    const missing: string[] = []
    for (const col of parsed.columns) {
      if (!columns.has(col)) {
        missing.push(col)
      }
    }
    if (missing.length > 0) {
      drifts.push({
        file: call.file,
        line: call.line,
        table: call.table,
        missingColumns: missing,
        availableColumns: Array.from(columns).sort(),
      })
    }

    validatedCalls += 1
  }

  return { drifts, skipped, validatedCalls }
}
