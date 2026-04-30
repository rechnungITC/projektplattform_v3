/**
 * PROJ-16 — Master Data UI types.
 */

import type { ProjectType } from "./project"
import type { ProjectMethod } from "./project-method"

/**
 * Allowed override fields per project-type. Locked to fields that exist
 * on `ProjectTypeProfile` today (PROJ-6 catalog). When the catalog grows
 * (e.g. document_templates), extend this whitelist + the Zod schema in
 * lib/project-types/overrides.ts in lockstep.
 */
export interface ProjectTypeOverrideFields {
  /** Replaces the inherited list when present. Empty array means "no roles". */
  standard_roles?: Array<{ key: string; label_de: string }>
  /** Replaces the inherited list when present. */
  required_info?: Array<{ key: string; label_de: string; description?: string }>
}

export interface ProjectTypeOverrideRow {
  id: string
  tenant_id: string
  type_key: ProjectType
  overrides: ProjectTypeOverrideFields
  updated_by: string
  created_at: string
  updated_at: string
}

export interface MethodOverrideRow {
  id: string
  tenant_id: string
  method_key: ProjectMethod
  enabled: boolean
  updated_by: string
  created_at: string
  updated_at: string
}

/** Shape returned by the tenant-wide stakeholder-rollup endpoint. */
export interface StakeholderRollupRow {
  id: string
  tenant_id: string
  project_id: string
  project_name: string | null
  name: string
  role_key: string
  org_unit: string | null
  influence: number | null
  impact: number | null
  is_active: boolean
  /** Class-3 fields — present only when the caller has admin access AND
   *  redact=false on the API. The rollup endpoint never returns them by
   *  default. */
  contact_email?: string | null
  contact_phone?: string | null
}
