// PROJ-45-α — Construction extension: trades and construction sections.
//
// Two axes that the shared core does not carry: WHO executes (trade) and WHERE
// it is executed (section). Both are additive — core projects, phases, work
// items and risks keep their semantics and are only referenced.

/** Manual traffic light on a project trade. Never computed — see lock L8. */
export type ConstructionRagStatus = "gruen" | "gelb" | "rot"

export const CONSTRUCTION_RAG_STATUSES: readonly ConstructionRagStatus[] = [
  "gruen",
  "gelb",
  "rot",
] as const

export const CONSTRUCTION_RAG_LABELS: Record<ConstructionRagStatus, string> = {
  gruen: "Grün",
  gelb: "Gelb",
  rot: "Rot",
}

/**
 * Tenant-wide trade catalog entry (Gewerk). Referenced, never copied: a rename
 * here reaches every project, which is exactly what lock L7 / AC-45.5 asks for.
 */
export interface ConstructionTrade {
  id: string
  tenant_id: string
  key: string
  label: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

/** A catalog trade assigned to one project, with its own responsibility state. */
export interface ProjectConstructionTrade {
  id: string
  tenant_id: string
  project_id: string
  trade_id: string
  responsible_user_id: string | null
  vendor_id: string | null
  rag_status: ConstructionRagStatus
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
  /** Joined from the catalog — the display source, never stored here. */
  trade?: Pick<ConstructionTrade, "id" | "key" | "label" | "is_active"> | null
}

/** A node in the free-depth construction section tree (Bauabschnitt). */
export interface ConstructionSection {
  id: string
  tenant_id: string
  project_id: string
  parent_id: string | null
  label: string
  description: string | null
  sort_order: number
  /**
   * Materialised ltree path, maintained by trigger. Read-only for clients; it
   * powers "filter includes descendants" (AC-45.20) without a recursive query.
   */
  path: string | null
  created_at: string
  updated_at: string
}

/** Section ↔ phase is many-to-many (AC-45.18). */
export interface ConstructionSectionPhase {
  section_id: string
  phase_id: string
}
