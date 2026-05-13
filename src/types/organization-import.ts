import type { OrganizationUnitType } from "./organization"

export type OrganizationImportLayout =
  | "orgchart_hierarchy"
  | "person_assignment"

export type OrganizationImportDedupStrategy = "skip" | "update" | "fail"

export type OrganizationImportStatus =
  | "preview"
  | "committed"
  | "rolled_back"
  | "failed"

export type OrganizationImportEntity =
  | "organization_unit"
  | "location"
  | "person_assignment"

export type OrganizationImportRowStatus =
  | "valid"
  | "warning"
  | "duplicate"
  | "errored"
  | "imported"
  | "updated"
  | "skipped"

export type PersonAssignmentEntityKind =
  | "tenant_member"
  | "resource"
  | "stakeholder"

export interface OrganizationImportIssue {
  code: string
  message: string
  field?: string
}

export interface OrganizationImportReportRow {
  row: number
  entity: OrganizationImportEntity
  status: OrganizationImportRowStatus
  action?: "create" | "update" | "skip" | "assign"
  errors: OrganizationImportIssue[]
  warnings: OrganizationImportIssue[]
  original: Record<string, string>
  values: Record<string, string | number | boolean | null>
}

export interface OrganizationImportSummary {
  total: number
  valid: number
  warnings: number
  duplicates: number
  errored: number
}

export interface OrganizationImportReport {
  layout: OrganizationImportLayout
  dedup_strategy: OrganizationImportDedupStrategy
  generated_at: string
  summary: OrganizationImportSummary
  rows: OrganizationImportReportRow[]
}

export interface OrganizationImport {
  id: string
  tenant_id: string
  layout: OrganizationImportLayout
  dedup_strategy: OrganizationImportDedupStrategy
  uploaded_by: string
  uploaded_at: string
  committed_at: string | null
  committed_by: string | null
  status: OrganizationImportStatus
  row_count_total: number
  row_count_imported: number
  row_count_skipped: number
  row_count_errored: number
  report: OrganizationImportReport
  original_filename: string
  created_at: string
  updated_at: string
}

export interface ExistingOrganizationUnitForImport {
  id: string
  code: string
  name: string
  type: OrganizationUnitType
  parent_id: string | null
  location_id: string | null
  is_active: boolean
}

export interface ExistingLocationForImport {
  id: string
  code: string
  name: string
  is_active: boolean
}

export interface PersonAssignmentCandidate {
  kind: PersonAssignmentEntityKind
  id: string
  email: string
  current_organization_unit_id: string | null
  display_name: string | null
}
