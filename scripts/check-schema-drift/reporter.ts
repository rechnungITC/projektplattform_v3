/**
 * Plain-text reporter for the drift check.
 *
 * Output goes to stdout (success summary) or stderr (drift details). The
 * format is human-readable in GitHub-Actions log panels — no ANSI colors,
 * no JSON. CI parsing is not a goal; humans diagnose drift, machines just
 * read the exit code.
 */

import type { DiffResult, Drift } from "./diff"

const TRUNCATE_AVAILABLE_AFTER = 20

export function formatSuccess(
  result: DiffResult,
  tableCount: number
): string {
  const skippedSummary =
    result.skipped.length > 0
      ? ` (${result.skipped.length} dynamic call${result.skipped.length === 1 ? "" : "s"} skipped)`
      : ""
  return `✓ schema-drift: ${result.validatedCalls} SELECT call${
    result.validatedCalls === 1 ? "" : "s"
  } verified across ${tableCount} table${tableCount === 1 ? "" : "s"} — 0 drift${skippedSummary}.`
}

export function formatDriftBlock(drift: Drift): string {
  const lines: string[] = []
  lines.push(`✗ ${drift.file}:${drift.line}`)
  lines.push(`  table:    ${drift.table}`)
  lines.push(`  missing:  ${drift.missingColumns.join(", ")}`)
  if (drift.availableColumns.length === 0) {
    lines.push(`  available: <table not in schema dump>`)
  } else {
    const truncated = drift.availableColumns.length > TRUNCATE_AVAILABLE_AFTER
    const slice = truncated
      ? drift.availableColumns.slice(0, TRUNCATE_AVAILABLE_AFTER)
      : drift.availableColumns
    const suffix = truncated
      ? ` (… and ${drift.availableColumns.length - TRUNCATE_AVAILABLE_AFTER} more)`
      : ""
    lines.push(`  available: ${slice.join(", ")}${suffix}`)
  }
  return lines.join("\n")
}

export function formatFailure(result: DiffResult): string {
  const header = `✗ schema-drift: ${result.drifts.length} drift${
    result.drifts.length === 1 ? "" : "s"
  } detected.`
  const blocks = result.drifts.map(formatDriftBlock).join("\n\n")
  const trailer =
    result.skipped.length > 0
      ? `\n\nNote: ${result.skipped.length} dynamic call${result.skipped.length === 1 ? " was" : "s were"} skipped (template literal SELECTs cannot be statically validated).`
      : ""
  return `${header}\n\n${blocks}${trailer}`
}
