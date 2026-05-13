import Papa from "papaparse"

export const ORGANIZATION_IMPORT_MAX_BYTES = 5 * 1024 * 1024
export const ORGANIZATION_IMPORT_MAX_ROWS = 10000

export interface ParsedCsvRow {
  rowNumber: number
  values: Record<string, string>
}

export interface ParsedCsvResult {
  rows: ParsedCsvRow[]
  errors: string[]
  meta: {
    delimiter: string
    fields: string[]
  }
}

export function parseOrganizationCsv(text: string): ParsedCsvResult {
  const source = stripBom(text)
  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => stripBom(header).trim(),
    transform: (value) => (typeof value === "string" ? value.trim() : value),
  })

  const rows = (parsed.data ?? []).map((values, index) => ({
    rowNumber: index + 2,
    values: normalizeRow(values),
  }))

  const errors = (parsed.errors ?? []).map((error) => {
    const row = typeof error.row === "number" ? `row ${error.row + 1}: ` : ""
    return `${row}${error.message}`
  })

  return {
    rows,
    errors,
    meta: {
      delimiter: parsed.meta.delimiter,
      fields: parsed.meta.fields ?? [],
    },
  }
}

export function assertCsvSize(file: File): string | null {
  if (file.size > ORGANIZATION_IMPORT_MAX_BYTES) {
    return "CSV exceeds the 5 MB upload limit."
  }
  return null
}

export function assertCsvRowLimit(rows: ParsedCsvRow[]): string | null {
  if (rows.length > ORGANIZATION_IMPORT_MAX_ROWS) {
    return "CSV exceeds the 10000 row limit. Split the file into smaller chunks."
  }
  return null
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/u, "")
}

function normalizeRow(values: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    const trimmedKey = stripBom(key).trim()
    if (!trimmedKey) continue
    normalized[trimmedKey] = typeof value === "string" ? value.trim() : ""
  }
  return normalized
}
