/**
 * PROJ-11 — resources, availabilities, allocations.
 *
 * Resources are tenant-scoped (one canonical row per person/party per
 * tenant). Allocations to work items live in `work_item_resources` and
 * are project-scoped via the work item.
 */

export type ResourceKind = "internal" | "external"

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  "internal",
  "external",
] as const

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  internal: "Intern",
  external: "Extern",
}

export interface Resource {
  id: string
  tenant_id: string
  source_stakeholder_id: string | null
  linked_user_id: string | null
  display_name: string
  kind: ResourceKind
  fte_default: number
  availability_default: number
  is_active: boolean
  /**
   * PROJ-54-α — Per-resource Tagessatz-Override. NULL means "no override;
   * fall back to role-rate resolution via stakeholder.role_key". Class-3 PII.
   */
  daily_rate_override: number | null
  /**
   * PROJ-54-α — ISO 4217 currency for daily_rate_override. NULL iff
   * daily_rate_override is NULL.
   */
  daily_rate_override_currency: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ResourceAvailability {
  id: string
  tenant_id: string
  resource_id: string
  start_date: string
  end_date: string
  fte: number
  note: string | null
  created_at: string
}

export interface WorkItemResource {
  id: string
  tenant_id: string
  project_id: string
  work_item_id: string
  resource_id: string
  allocation_pct: number
  created_by: string
  created_at: string
  updated_at: string
}

export type UtilizationBucket = "week" | "month" | "quarter"

export const UTILIZATION_BUCKETS: readonly UtilizationBucket[] = [
  "week",
  "month",
  "quarter",
] as const

export const UTILIZATION_BUCKET_LABELS: Record<UtilizationBucket, string> = {
  week: "Wöchentlich",
  month: "Monatlich",
  quarter: "Quartalsweise",
}

export interface UtilizationCell {
  resource_id: string
  resource_name: string
  bucket_start: string
  bucket_end: string
  utilization: number
}
