/**
 * PROJ-20 — open item types. Open items are lightweight clarification
 * artifacts that convert into either a work_item (task) or a decision.
 * Conversion is one-way: status `converted` is final.
 */

export type OpenItemStatus =
  | "open"
  | "in_clarification"
  | "closed"
  | "converted"

export const OPEN_ITEM_STATUSES: readonly OpenItemStatus[] = [
  "open",
  "in_clarification",
  "closed",
  "converted",
] as const

export const OPEN_ITEM_STATUS_LABELS: Record<OpenItemStatus, string> = {
  open: "Offen",
  in_clarification: "In Klärung",
  closed: "Geschlossen",
  converted: "Umgewandelt",
}

export type OpenItemConvertedKind = "work_items" | "decisions"

export interface OpenItem {
  id: string
  tenant_id: string
  project_id: string
  title: string
  description: string | null
  status: OpenItemStatus
  contact: string | null
  contact_stakeholder_id: string | null
  converted_to_entity_type: OpenItemConvertedKind | null
  converted_to_entity_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}
