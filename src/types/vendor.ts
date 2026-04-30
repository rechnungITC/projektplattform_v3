/**
 * PROJ-15 — vendor and procurement types.
 */

export type VendorStatus = "active" | "inactive"

export const VENDOR_STATUSES: readonly VendorStatus[] = [
  "active",
  "inactive",
] as const

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  active: "Aktiv",
  inactive: "Inaktiv",
}

export type VendorRole =
  | "lieferant"
  | "subunternehmer"
  | "berater"
  | "weitere"

export const VENDOR_ROLES: readonly VendorRole[] = [
  "lieferant",
  "subunternehmer",
  "berater",
  "weitere",
] as const

export const VENDOR_ROLE_LABELS: Record<VendorRole, string> = {
  lieferant: "Lieferant",
  subunternehmer: "Subunternehmer",
  berater: "Berater",
  weitere: "Weitere",
}

export type VendorDocumentKind =
  | "offer"
  | "contract"
  | "nda"
  | "reference"
  | "other"

export const VENDOR_DOCUMENT_KINDS: readonly VendorDocumentKind[] = [
  "offer",
  "contract",
  "nda",
  "reference",
  "other",
] as const

export const VENDOR_DOCUMENT_KIND_LABELS: Record<VendorDocumentKind, string> = {
  offer: "Angebot",
  contract: "Vertrag",
  nda: "NDA",
  reference: "Referenz",
  other: "Sonstiges",
}

export interface Vendor {
  id: string
  tenant_id: string
  name: string
  category: string | null
  primary_contact_email: string | null
  website: string | null
  status: VendorStatus
  created_by: string
  created_at: string
  updated_at: string
}

export interface VendorWithStats extends Vendor {
  /** Server-computed average score across all evaluations; null when none. */
  avg_score: number | null
  evaluation_count: number
  assignment_count: number
}

export interface VendorEvaluation {
  id: string
  tenant_id: string
  vendor_id: string
  criterion: string
  score: number
  comment: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface VendorDocument {
  id: string
  tenant_id: string
  vendor_id: string
  kind: VendorDocumentKind
  title: string
  external_url: string
  document_date: string | null
  note: string | null
  created_by: string
  created_at: string
}

export interface VendorProjectAssignment {
  id: string
  tenant_id: string
  project_id: string
  vendor_id: string
  role: VendorRole
  scope_note: string | null
  valid_from: string | null
  valid_until: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/** Project assignment joined to its vendor name, used in the Project-Room tab. */
export interface VendorProjectAssignmentRich extends VendorProjectAssignment {
  vendor_name: string
}
