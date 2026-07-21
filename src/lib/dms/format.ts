/**
 * PROJ-79-α — human-readable byte formatting for the DMS UI (file sizes +
 * quota bar). Pure, dependency-free.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const

/** Format a byte count as e.g. `1.4 MB`, `512 B`, `2.0 GB`. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / Math.pow(1024, exp)
  // Whole bytes render without decimals.
  const digits = exp === 0 ? 0 : fractionDigits
  return `${value.toFixed(digits)} ${UNITS[exp]}`
}
