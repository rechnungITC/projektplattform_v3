import {
  ORGANIZATION_UNIT_TYPES,
  type OrganizationUnitType,
} from "@/types/organization"
import type {
  ExistingLocationForImport,
  ExistingOrganizationUnitForImport,
  OrganizationImportDedupStrategy,
  OrganizationImportIssue,
  OrganizationImportLayout,
  OrganizationImportReport,
  OrganizationImportReportRow,
  PersonAssignmentCandidate,
  PersonAssignmentEntityKind,
} from "@/types/organization-import"

import type { ParsedCsvRow } from "./csv-parsers"

const UNIT_TYPES = new Set<string>(ORGANIZATION_UNIT_TYPES)
const PERSON_KINDS: PersonAssignmentEntityKind[] = [
  "tenant_member",
  "resource",
  "stakeholder",
]

interface OrgChartValidationInput {
  unitRows: ParsedCsvRow[]
  locationRows?: ParsedCsvRow[]
  existingUnits: ExistingOrganizationUnitForImport[]
  existingLocations: ExistingLocationForImport[]
  dedupStrategy: OrganizationImportDedupStrategy
}

interface PersonValidationInput {
  rows: ParsedCsvRow[]
  existingUnits: ExistingOrganizationUnitForImport[]
  candidates: PersonAssignmentCandidate[]
  dedupStrategy: OrganizationImportDedupStrategy
}

export function validateOrgChartImport({
  unitRows,
  locationRows = [],
  existingUnits,
  existingLocations,
  dedupStrategy,
}: OrgChartValidationInput): OrganizationImportReport {
  const existingUnitCodes = new Map(
    existingUnits.map((unit) => [normalizeCode(unit.code), unit]),
  )
  const existingLocationCodes = new Map(
    existingLocations.map((location) => [normalizeCode(location.code), location]),
  )

  const locationCodeCounts = countCodes(locationRows, "location_code")
  const locationReports = locationRows.map((row) =>
    validateLocationRow(row, {
      existingLocationCodes,
      locationCodeCounts,
      dedupStrategy,
    }),
  )
  const validLocationCodes = new Set(existingLocationCodes.keys())
  for (const report of locationReports) {
    if (report.errors.length === 0) {
      validLocationCodes.add(String(report.values.location_code))
    }
  }

  const unitCodeCounts = countCodes(unitRows, "unit_code")
  const importUnitCodes = new Set(
    unitRows
      .map((row) => normalizeCode(row.values.unit_code))
      .filter((code) => code.length > 0),
  )
  const cycleCodes = detectImportCycles(unitRows)
  const unitReports = unitRows.map((row) =>
    validateUnitRow(row, {
      existingUnitCodes,
      importUnitCodes,
      validLocationCodes,
      unitCodeCounts,
      cycleCodes,
      dedupStrategy,
    }),
  )

  return buildReport("orgchart_hierarchy", dedupStrategy, [
    ...locationReports,
    ...unitReports,
  ])
}

export function validatePersonAssignmentImport({
  rows,
  existingUnits,
  candidates,
  dedupStrategy,
}: PersonValidationInput): OrganizationImportReport {
  const unitsByCode = new Map(
    existingUnits.map((unit) => [normalizeCode(unit.code), unit]),
  )
  const candidatesByEmail = new Map<string, PersonAssignmentCandidate[]>()
  for (const candidate of candidates) {
    const email = normalizeEmail(candidate.email)
    if (!email) continue
    const list = candidatesByEmail.get(email) ?? []
    list.push({ ...candidate, email })
    candidatesByEmail.set(email, list)
  }

  const reports = rows.map((row) =>
    validatePersonAssignmentRow(row, {
      unitsByCode,
      candidatesByEmail,
    }),
  )

  return buildReport("person_assignment", dedupStrategy, reports)
}

export function normalizeCode(value: unknown): string {
  return String(value ?? "").trim().toUpperCase()
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

function validateLocationRow(
  row: ParsedCsvRow,
  context: {
    existingLocationCodes: Map<string, ExistingLocationForImport>
    locationCodeCounts: Map<string, number>
    dedupStrategy: OrganizationImportDedupStrategy
  },
): OrganizationImportReportRow {
  const errors: OrganizationImportIssue[] = []
  const warnings: OrganizationImportIssue[] = []
  const locationCode = normalizeCode(row.values.location_code)
  const name = value(row, "name")

  required(locationCode, "location_code", errors)
  required(name, "name", errors)
  duplicateInFile(
    locationCode,
    "location_code",
    context.locationCodeCounts,
    errors,
  )

  const existing = locationCode
    ? context.existingLocationCodes.get(locationCode)
    : null
  const action = duplicateAction(existing, context.dedupStrategy, errors, warnings)

  return {
    row: row.rowNumber,
    entity: "location",
    status: statusFor(errors, warnings, Boolean(existing)),
    action,
    errors,
    warnings,
    original: row.values,
    values: {
      location_code: locationCode || null,
      name: name || null,
      country: nullableValue(row, "country"),
      city: nullableValue(row, "city"),
      address: nullableValue(row, "address"),
      is_active: parseBoolean(row, "is_active", true, errors),
      existing_location_id: existing?.id ?? null,
    },
  }
}

function validateUnitRow(
  row: ParsedCsvRow,
  context: {
    existingUnitCodes: Map<string, ExistingOrganizationUnitForImport>
    importUnitCodes: Set<string>
    validLocationCodes: Set<string>
    unitCodeCounts: Map<string, number>
    cycleCodes: Set<string>
    dedupStrategy: OrganizationImportDedupStrategy
  },
): OrganizationImportReportRow {
  const errors: OrganizationImportIssue[] = []
  const warnings: OrganizationImportIssue[] = []
  const unitCode = normalizeCode(row.values.unit_code)
  const parentCode = normalizeCode(row.values.parent_code)
  const locationCode = normalizeCode(row.values.location_code)
  const type = value(row, "type") as OrganizationUnitType
  const name = value(row, "name")

  required(unitCode, "unit_code", errors)
  required(name, "name", errors)
  required(type, "type", errors)
  duplicateInFile(unitCode, "unit_code", context.unitCodeCounts, errors)

  if (type && !UNIT_TYPES.has(type)) {
    errors.push({
      code: "invalid_type",
      field: "type",
      message: `Type must be one of ${ORGANIZATION_UNIT_TYPES.join(", ")}.`,
    })
  }
  if (parentCode && parentCode === unitCode) {
    errors.push({
      code: "self_parent",
      field: "parent_code",
      message: "parent_code must not equal unit_code.",
    })
  }
  if (
    parentCode &&
    !context.importUnitCodes.has(parentCode) &&
    !context.existingUnitCodes.has(parentCode)
  ) {
    errors.push({
      code: "unknown_parent",
      field: "parent_code",
      message: `Parent code ${parentCode} is not known.`,
    })
  }
  if (locationCode && !context.validLocationCodes.has(locationCode)) {
    errors.push({
      code: "unknown_location",
      field: "location_code",
      message: `Location code ${locationCode} is not known.`,
    })
  }
  if (context.cycleCodes.has(unitCode)) {
    errors.push({
      code: "cycle_detected",
      field: "parent_code",
      message: "Import hierarchy contains a cycle.",
    })
  }

  const sortOrder = parseInteger(row, "sort_order", errors)
  const existing = unitCode ? context.existingUnitCodes.get(unitCode) : null
  const action = duplicateAction(existing, context.dedupStrategy, errors, warnings)

  return {
    row: row.rowNumber,
    entity: "organization_unit",
    status: statusFor(errors, warnings, Boolean(existing)),
    action,
    errors,
    warnings,
    original: row.values,
    values: {
      unit_code: unitCode || null,
      parent_code: parentCode || null,
      location_code: locationCode || null,
      name: name || null,
      type: type || null,
      description: nullableValue(row, "description"),
      is_active: parseBoolean(row, "is_active", true, errors),
      sort_order: sortOrder,
      existing_unit_id: existing?.id ?? null,
    },
  }
}

function validatePersonAssignmentRow(
  row: ParsedCsvRow,
  context: {
    unitsByCode: Map<string, ExistingOrganizationUnitForImport>
    candidatesByEmail: Map<string, PersonAssignmentCandidate[]>
  },
): OrganizationImportReportRow {
  const errors: OrganizationImportIssue[] = []
  const warnings: OrganizationImportIssue[] = []
  const email = normalizeEmail(row.values.email)
  const orgUnitCode = normalizeCode(row.values.org_unit_code)
  const requestedKind = value(row, "entity_kind") as PersonAssignmentEntityKind

  required(email, "email", errors)
  required(orgUnitCode, "org_unit_code", errors)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    errors.push({
      code: "invalid_email",
      field: "email",
      message: "Email format is invalid.",
    })
  }

  const unit = orgUnitCode ? context.unitsByCode.get(orgUnitCode) : null
  if (orgUnitCode && !unit) {
    errors.push({
      code: "unknown_org_unit",
      field: "org_unit_code",
      message: `Organization unit code ${orgUnitCode} is not known.`,
    })
  } else if (unit && !unit.is_active) {
    warnings.push({
      code: "inactive_org_unit",
      field: "org_unit_code",
      message: `Organization unit code ${orgUnitCode} is inactive.`,
    })
  }

  if (requestedKind && !PERSON_KINDS.includes(requestedKind)) {
    errors.push({
      code: "invalid_entity_kind",
      field: "entity_kind",
      message: "entity_kind must be tenant_member, resource, or stakeholder.",
    })
  }

  const candidates = email ? context.candidatesByEmail.get(email) ?? [] : []
  const selected = selectCandidate(candidates, requestedKind || null)
  if (email && candidates.length === 0) {
    errors.push({
      code: "person_not_found",
      field: "email",
      message: "No tenant member, resource, or stakeholder matches this email.",
    })
  }
  if (email && requestedKind && !selected) {
    errors.push({
      code: "person_kind_not_found",
      field: "entity_kind",
      message: `No ${requestedKind} matches this email.`,
    })
  }
  if (!requestedKind && candidates.length > 1) {
    warnings.push({
      code: "ambiguous_person_match",
      field: "entity_kind",
      message: "Email matches multiple entity kinds; default order was used.",
    })
  }

  return {
    row: row.rowNumber,
    entity: "person_assignment",
    status: statusFor(errors, warnings, false),
    action: "assign",
    errors,
    warnings,
    original: row.values,
    values: {
      email,
      org_unit_code: orgUnitCode || null,
      organization_unit_id: unit?.id ?? null,
      entity_kind: selected?.kind ?? requestedKind ?? null,
      target_id: selected?.id ?? null,
      current_organization_unit_id:
        selected?.current_organization_unit_id ?? null,
    },
  }
}

function duplicateAction(
  existing:
    | ExistingOrganizationUnitForImport
    | ExistingLocationForImport
    | null
    | undefined,
  strategy: OrganizationImportDedupStrategy,
  errors: OrganizationImportIssue[],
  warnings: OrganizationImportIssue[],
): "create" | "update" | "skip" {
  if (!existing) return "create"
  if (strategy === "fail") {
    errors.push({
      code: "duplicate_code",
      message: "Code already exists in this tenant.",
    })
    return "skip"
  }
  warnings.push({
    code: "duplicate_code",
    message:
      strategy === "update"
        ? "Code already exists and will be updated."
        : "Code already exists and will be skipped.",
  })
  return strategy === "update" ? "update" : "skip"
}

function statusFor(
  errors: OrganizationImportIssue[],
  warnings: OrganizationImportIssue[],
  duplicate: boolean,
): OrganizationImportReportRow["status"] {
  if (errors.length > 0) return "errored"
  if (duplicate) return "duplicate"
  if (warnings.length > 0) return "warning"
  return "valid"
}

function buildReport(
  layout: OrganizationImportLayout,
  dedupStrategy: OrganizationImportDedupStrategy,
  rows: OrganizationImportReportRow[],
): OrganizationImportReport {
  return {
    layout,
    dedup_strategy: dedupStrategy,
    generated_at: new Date().toISOString(),
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((row) => row.status === "valid").length,
      warnings: rows.filter((row) => row.warnings.length > 0).length,
      duplicates: rows.filter((row) => row.status === "duplicate").length,
      errored: rows.filter((row) => row.errors.length > 0).length,
    },
  }
}

function required(
  valueToCheck: string,
  field: string,
  errors: OrganizationImportIssue[],
) {
  if (!valueToCheck) {
    errors.push({
      code: "required",
      field,
      message: `${field} is required.`,
    })
  }
}

function duplicateInFile(
  code: string,
  field: string,
  counts: Map<string, number>,
  errors: OrganizationImportIssue[],
) {
  if (code && (counts.get(code) ?? 0) > 1) {
    errors.push({
      code: "duplicate_in_file",
      field,
      message: `${field} is duplicated in the CSV.`,
    })
  }
}

function countCodes(rows: ParsedCsvRow[], field: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const code = normalizeCode(row.values[field])
    if (!code) continue
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return counts
}

function detectImportCycles(rows: ParsedCsvRow[]): Set<string> {
  const parentByCode = new Map<string, string>()
  for (const row of rows) {
    const code = normalizeCode(row.values.unit_code)
    const parent = normalizeCode(row.values.parent_code)
    if (code && parent) parentByCode.set(code, parent)
  }

  const cycleCodes = new Set<string>()
  for (const start of parentByCode.keys()) {
    const seen = new Set<string>()
    let current: string | undefined = start
    while (current && parentByCode.has(current)) {
      if (seen.has(current)) {
        for (const code of seen) cycleCodes.add(code)
        break
      }
      seen.add(current)
      current = parentByCode.get(current)
    }
  }
  return cycleCodes
}

function selectCandidate(
  candidates: PersonAssignmentCandidate[],
  requestedKind: PersonAssignmentEntityKind | null,
): PersonAssignmentCandidate | null {
  if (requestedKind) {
    return candidates.find((candidate) => candidate.kind === requestedKind) ?? null
  }
  for (const kind of PERSON_KINDS) {
    const candidate = candidates.find((item) => item.kind === kind)
    if (candidate) return candidate
  }
  return null
}

function parseBoolean(
  row: ParsedCsvRow,
  field: string,
  fallback: boolean,
  errors: OrganizationImportIssue[],
): boolean {
  const raw = value(row, field).toLowerCase()
  if (!raw) return fallback
  if (["true", "1", "yes", "ja", "active", "aktiv"].includes(raw)) {
    return true
  }
  if (["false", "0", "no", "nein", "inactive", "inaktiv"].includes(raw)) {
    return false
  }
  errors.push({
    code: "invalid_boolean",
    field,
    message: `${field} must be true or false.`,
  })
  return fallback
}

function parseInteger(
  row: ParsedCsvRow,
  field: string,
  errors: OrganizationImportIssue[],
): number | null {
  const raw = value(row, field)
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || String(parsed) !== raw) {
    errors.push({
      code: "invalid_integer",
      field,
      message: `${field} must be an integer.`,
    })
    return null
  }
  return parsed
}

function value(row: ParsedCsvRow, field: string): string {
  return String(row.values[field] ?? "").trim()
}

function nullableValue(row: ParsedCsvRow, field: string): string | null {
  const v = value(row, field)
  return v || null
}
