/**
 * Local-time YYYY-MM-DD formatting helpers.
 *
 * Avoid `Date.toISOString().slice(0, 10)` for date-only fields — it formats
 * in UTC and shifts the visible date by ±1 day in non-UTC timezones (e.g. a
 * CET user picking 1. May would persist `2026-04-30`).
 *
 * The pattern below mirrors the existing `dateToIsoDate` helpers duplicated
 * across `src/components/{milestones,sprints,phases}/*-dialog.tsx`. New code
 * should import from here; the legacy duplicates can be migrated opportunistically.
 */

export function dateToIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null
  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, "0")
  const dd = String(value.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Parse a `YYYY-MM-DD` string into a Date at local-time midnight.
 *
 * `new Date("2026-05-01")` parses as UTC midnight per spec, which then
 * `getDate()`-renders as the previous day in negative-offset timezones.
 * This helper constructs the date with the local-time constructor so
 * round-tripping `dateToIsoDate(parseLocalDate(s)) === s` for any timezone.
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10) - 1
  const day = Number.parseInt(match[3], 10)
  return new Date(year, month, day)
}
