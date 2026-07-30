// PROJ-115 — polymorphic external (VDR) document links.

export type ExternalLinkEntityType =
  | "dd_question"
  | "dd_finding"
  | "work_item"
  | "deliverable"

export const EXTERNAL_LINK_ENTITY_TYPES: ExternalLinkEntityType[] = [
  "dd_question",
  "dd_finding",
  "work_item",
  "deliverable",
]

export interface ExternalDocumentLink {
  id: string
  tenant_id: string
  entity_type: ExternalLinkEntityType
  entity_id: string
  url: string
  label: string | null
  added_by: string | null
  created_at: string
}
