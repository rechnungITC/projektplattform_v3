/**
 * PROJ-94 — M&A project strategic-foundation types.
 *
 * Mirrors the `ma_project_profiles` extension table (1:1 with `projects`).
 * Fork 1 (ma-domain-architecture ADR): M&A is one `project_type='ma'`; the
 * deal variant is the `deal_side` FIELD here, not a separate type.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

/** Deal variant (Fork 1). Optional — not an AC-1 mandatory field. */
export type DealSide = "buy" | "sell" | "jv" | "carve_out"

export const DEAL_SIDES: readonly DealSide[] = [
  "buy",
  "sell",
  "jv",
  "carve_out",
] as const

export const DEAL_SIDE_LABELS: Record<DealSide, string> = {
  buy: "Buy-Side",
  sell: "Sell-Side",
  jv: "Joint Venture",
  carve_out: "Carve-out",
}

/** Mandate state machine (AC-4). draft → submitted → approved (terminal). */
export type MandateStatus = "draft" | "submitted" | "approved"

export const MANDATE_STATUSES: readonly MandateStatus[] = [
  "draft",
  "submitted",
  "approved",
] as const

export const MANDATE_STATUS_LABELS: Record<MandateStatus, string> = {
  draft: "Entwurf",
  submitted: "Eingereicht",
  approved: "Mandat freigegeben",
}

/**
 * Allowed mandate transitions. Source of truth is the DB function
 * `transition_mandate_status`; this mirror drives action-menu rendering.
 */
export const ALLOWED_MANDATE_TRANSITIONS: Record<
  MandateStatus,
  MandateStatus[]
> = {
  draft: ["submitted", "approved"],
  submitted: ["approved", "draft"],
  approved: [],
}

/** Row shape of `ma_project_profiles`. */
export interface MaProjectProfile {
  id: string
  tenant_id: string
  project_id: string
  deal_side: DealSide | null
  sponsor_user_id: string
  mandate_status: MandateStatus
  deal_rationale: string | null
  search_profile: string | null
  exclusion_criteria: string | null
  investment_frame_amount: number | null
  investment_frame_currency: string | null
  investment_frame_note: string | null
  strategic_document_link: string | null
  confidentiality_level: MaConfidentialityLevel
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * Wizard accumulator block for the conditional "M&A-Grundlage" step. Lives in
 * the draft's passthrough JSON payload — no draft-table schema change. The
 * finalize route reads it and calls `create_ma_project_profile`.
 */
export interface MaFoundationData {
  deal_side: DealSide | null
  sponsor_user_id: string | null
  deal_rationale: string
  search_profile: string
  exclusion_criteria: string
  investment_frame_amount: string
  investment_frame_currency: string
  investment_frame_note: string
  strategic_document_link: string
  confidentiality_level: MaConfidentialityLevel
}

export function emptyMaFoundationData(): MaFoundationData {
  return {
    deal_side: null,
    sponsor_user_id: null,
    deal_rationale: "",
    search_profile: "",
    exclusion_criteria: "",
    investment_frame_amount: "",
    investment_frame_currency: "EUR",
    investment_frame_note: "",
    strategic_document_link: "",
    confidentiality_level: "standard",
  }
}
