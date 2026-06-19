/**
 * PROJ-48 — Class-3 redaction at the MCP boundary.
 *
 * Every field a tool would emit is run through the deployed
 * `classifyField(table, column)` registry (PROJ-12). Class-3 fields are
 * DROPPED (never masked-with-real-value, never emitted). Unknown columns
 * default to Class 3 (default-deny) and are therefore dropped too. The caller
 * receives only Class-1/2 fields plus redaction metadata (which fields were
 * withheld and how many) — never the raw hidden value.
 *
 * Row-level need-to-know (PROJ-100a `confidentiality_level`) is enforced
 * upstream in the tool queries (only `standard` rows are selected), because
 * the MCP route runs under the service-role client which bypasses RLS.
 */

import { classifyField } from "@/lib/ai/data-privacy-registry"
import type { DataClass } from "@/lib/ai/types"

export interface RedactionResult<T extends Record<string, unknown>> {
  /** The row with all Class-3 fields removed. */
  row: Partial<T>
  /** Field names that were withheld (Class 3 / unknown). */
  redactedFields: string[]
}

/**
 * Drop every Class-3 field from a single row.
 *
 * @param table          DB table name (registry key prefix).
 * @param row            Raw row from a tenant-scoped query.
 * @param tenantDefault  Tenant privacy default for *unknown* fields (PROJ-17);
 *                       defaults to 3 (system default-deny).
 */
export function redactRow<T extends Record<string, unknown>>(
  table: string,
  row: T,
  tenantDefault: DataClass = 3,
): RedactionResult<T> {
  const out: Partial<T> = {}
  const redactedFields: string[] = []

  for (const key of Object.keys(row) as (keyof T & string)[]) {
    const klass = classifyField(table, key, tenantDefault)
    if (klass >= 3) {
      redactedFields.push(key)
      continue
    }
    out[key] = row[key]
  }

  return { row: out, redactedFields }
}

/**
 * Redact a list of rows and aggregate the total redaction count for audit.
 * `redactionCount` is the total number of withheld field *occurrences*
 * across all rows (rows × distinct Class-3 fields), which is what the
 * `mcp_tool_calls.redaction_count` audit column records.
 */
export function redactRows<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  tenantDefault: DataClass = 3,
): { rows: Partial<T>[]; redactionCount: number; redactedFields: string[] } {
  const redactedFieldSet = new Set<string>()
  let redactionCount = 0
  const redacted = rows.map((r) => {
    const { row, redactedFields } = redactRow(table, r, tenantDefault)
    redactionCount += redactedFields.length
    redactedFields.forEach((f) => redactedFieldSet.add(f))
    return row
  })
  return {
    rows: redacted,
    redactionCount,
    redactedFields: [...redactedFieldSet].sort(),
  }
}
