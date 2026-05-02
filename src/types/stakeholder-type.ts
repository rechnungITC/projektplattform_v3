/**
 * PROJ-33 Phase 33-β — stakeholder-type-catalog types.
 *
 * Tenant-erweiterbarer Catalog mit globalen Defaults (`tenant_id IS NULL`)
 * und tenant-eigenen Custom-Einträgen. Globale Defaults sind RLS-immutable;
 * Tenant-Admins CRUD-en nur Einträge mit `tenant_id = active_tenant`.
 */

export interface StakeholderType {
  id: string
  /** NULL = global default (immutable). Otherwise tenant-owned. */
  tenant_id: string | null
  /** Lookup key — unique per tenant_id (incl. NULL). */
  key: string
  label_de: string
  label_en: string | null
  /** Hex color string `#rrggbb` (regex-validated by DB). */
  color: string
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StakeholderTypeInput {
  key: string
  label_de: string
  label_en?: string | null
  color: string
  display_order?: number
  is_active?: boolean
}

/**
 * Default global keys seeded by Phase-33-β migration. Code referenziert
 * sie hardcoded für KI-Prompts (PROJ-36) und für die UI als
 * Fallback-Empfehlungen.
 */
export const STAKEHOLDER_TYPE_DEFAULT_KEYS = [
  "promoter",
  "supporter",
  "critic",
  "blocker",
] as const

export type StakeholderTypeDefaultKey =
  (typeof STAKEHOLDER_TYPE_DEFAULT_KEYS)[number]

/** Helper for UI: detect if an entry is a global default. */
export function isGlobalDefault(t: StakeholderType): boolean {
  return t.tenant_id === null
}
