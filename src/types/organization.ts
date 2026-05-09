/**
 * PROJ-62 — Organization master-data types.
 *
 * Frontend ships against the upcoming /backend slice; the API contracts
 * declared here are the single source of truth for both layers. Backend
 * will mirror the same shapes when it lands.
 */

export type OrganizationUnitType =
  | "group"
  | "company"
  | "department"
  | "team"
  | "project_org"
  | "external_org"

export const ORGANIZATION_UNIT_TYPES: readonly OrganizationUnitType[] = [
  "group",
  "company",
  "department",
  "team",
  "project_org",
  "external_org",
] as const

export const ORGANIZATION_UNIT_TYPE_LABELS: Record<
  OrganizationUnitType,
  string
> = {
  group: "Unternehmensgruppe",
  company: "Gesellschaft",
  department: "Abteilung / Bereich",
  team: "Team",
  project_org: "Projektorganisation",
  external_org: "Externe Organisation",
}

/** Visual ordering — used for the type-filter chips and tree colouring. */
export const ORGANIZATION_UNIT_TYPE_ORDER: Record<
  OrganizationUnitType,
  number
> = {
  group: 1,
  company: 2,
  department: 3,
  team: 4,
  project_org: 5,
  external_org: 9,
}

/** Whether a type is internal (counted in the default tree) or
 *  considered an external partner. Used by the "intern/extern" filter. */
export function isInternalOrgType(type: OrganizationUnitType): boolean {
  return type !== "external_org"
}

export interface OrganizationUnit {
  id: string
  tenant_id: string
  parent_id: string | null
  name: string
  code: string | null
  type: OrganizationUnitType
  location_id: string | null
  description: string | null
  is_active: boolean
  sort_order: number | null
  created_at: string
  updated_at: string
}

/** Server-built tree node — children are inlined for react-arborist. */
export interface OrganizationUnitTreeNode extends OrganizationUnit {
  children: OrganizationUnitTreeNode[]
  /** Counts of attached entities under this node (own, not roll-up). */
  counts: {
    stakeholders: number
    resources: number
    tenant_members: number
    children: number
  }
}

/** Item shape returned by the shared combobox endpoint. */
export interface OrganizationUnitComboboxItem {
  id: string
  name: string
  type: OrganizationUnitType
  /** Crumb path "Beispiel GmbH › Hamburg › IT › CRM Team". */
  breadcrumb_path: string
  is_active: boolean
}

export interface Location {
  id: string
  tenant_id: string
  name: string
  country: string | null
  city: string | null
  address: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Unified item for the read-only "Vendors einblenden" tree view. */
export interface OrganizationLandscapeItem {
  id: string
  tenant_id: string
  name: string
  /** 'org_unit' rows come from organization_units, 'vendor' rows from
   *  vendors (PROJ-15) joined via the read-only view. */
  kind: "org_unit" | "vendor"
  type: OrganizationUnitType | null
  parent_id: string | null
  location_id: string | null
}

// ---------------------------------------------------------------------------
// Request bodies (declared here for hooks + future backend handlers).

export interface CreateOrganizationUnitRequest {
  name: string
  type: OrganizationUnitType
  parent_id?: string | null
  location_id?: string | null
  code?: string | null
  description?: string | null
  sort_order?: number | null
}

export interface PatchOrganizationUnitRequest {
  /** Optimistic-lock token from the original GET. Required on update. */
  expected_updated_at: string
  name?: string
  type?: OrganizationUnitType
  parent_id?: string | null
  location_id?: string | null
  code?: string | null
  description?: string | null
  sort_order?: number | null
  is_active?: boolean
}

export interface MoveOrganizationUnitRequest {
  new_parent_id: string | null
  expected_updated_at: string
}

export interface CreateLocationRequest {
  name: string
  country?: string | null
  city?: string | null
  address?: string | null
}

export interface PatchLocationRequest {
  expected_updated_at: string
  name?: string
  country?: string | null
  city?: string | null
  address?: string | null
  is_active?: boolean
}

// ---------------------------------------------------------------------------
// Error shapes — surfaced in the UI for the dialogs that need them.

export interface OrganizationDependencyBlocker {
  kind: "children" | "stakeholders" | "resources" | "tenant_members" | "locations"
  count: number
  /** A small sample of names for the confirmation dialog. */
  sample: string[]
}