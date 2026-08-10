// PROJ-115 — polymorphic external (VDR) document links.

export type ExternalLinkEntityType =
  | "dd_question"
  | "dd_finding"
  | "work_item"
  | "deliverable"
  // PROJ-120 — Bewertungs-Artefakt (Excel/PDF im Fachwerkzeug bzw. VDR). Die
  // Plattform verlinkt bewusst nur; ein Upload wäre heute nicht auf "Inner
  // Circle" einschränkbar (DMS ohne confidentiality_level → PROJ-Y-120c/115c).
  | "ma_valuation"
  // PROJ-122 — SPA issues carry a free-text clause reference; the actual draft
  // or redline lives in the data room, so the document link is what makes the
  // reference verifiable.
  | "spa_issue"

export const EXTERNAL_LINK_ENTITY_TYPES: ExternalLinkEntityType[] = [
  "dd_question",
  "dd_finding",
  "work_item",
  "deliverable",
  "ma_valuation",
  "spa_issue",
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
