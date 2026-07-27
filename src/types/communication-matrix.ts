/**
 * PROJ-118 — Kommunikationsmatrix (M&A communication planning matrix).
 *
 * Distinct from PROJ-13 `communication.ts` (outbox/chat): this is the M&A
 * governance planning layer — target groups, messages, channels, and a
 * single-approver workflow with hard SoD + need-to-know. Mirrors the
 * committees types pattern (PROJ-98).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

/**
 * Approval workflow state for a communication matrix entry.
 * draft → pending_approval → approved → sent (rejected is a terminal branch
 * back to draft via re-submit).
 */
export type ApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "rejected"

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "rejected",
] as const

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: "Entwurf",
  pending_approval: "Wartet auf Freigabe",
  approved: "Freigegeben",
  sent: "Versendet",
  rejected: "Abgelehnt",
}

/**
 * App-level catalogue of target groups for the communication matrix. `custom`
 * pairs with a free-text `target_group_label`. The DB stores `target_group_key`
 * as free text; this list drives the UI picker.
 */
export type TargetGroupKey =
  | "geschaeftsfuehrung"
  | "beirat"
  | "fuehrungskraefte"
  | "mitarbeiter"
  | "kunden"
  | "lieferanten"
  | "banken"
  | "behoerden"
  | "presse"
  | "custom"

export const TARGET_GROUP_KEYS: readonly TargetGroupKey[] = [
  "geschaeftsfuehrung",
  "beirat",
  "fuehrungskraefte",
  "mitarbeiter",
  "kunden",
  "lieferanten",
  "banken",
  "behoerden",
  "presse",
  "custom",
] as const

export const TARGET_GROUP_LABELS: Record<TargetGroupKey, string> = {
  geschaeftsfuehrung: "Geschäftsführung",
  beirat: "Beirat",
  fuehrungskraefte: "Führungskräfte",
  mitarbeiter: "Mitarbeiter",
  kunden: "Kunden",
  lieferanten: "Lieferanten",
  banken: "Banken",
  behoerden: "Behörden",
  presse: "Presse",
  custom: "Individuell",
}

export interface CommunicationEntry {
  id: string
  tenant_id: string
  project_id: string
  target_group_key: string
  target_group_label: string | null
  message: string | null
  channel: string | null
  planned_date: string | null
  actual_date: string | null
  responsible_user_id: string | null
  approver_user_id: string | null
  approval_status: ApprovalStatus
  approved_at: string | null
  rejection_reason: string | null
  confidentiality_level: MaConfidentialityLevel
  template_id: string | null
  phase_id: string | null
  stage_gate_id: string | null
  work_item_id: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CommunicationTemplate {
  id: string
  tenant_id: string
  template_key: string
  name: string
  default_target_group_key: string | null
  default_channel: string | null
  default_confidentiality: MaConfidentialityLevel
  body_skeleton: string | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
