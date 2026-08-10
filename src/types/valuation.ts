// PROJ-120 — Bewertungsmodell und Business Case (Epic I).
//
// Eine Bewertung ist eine UNVERÄNDERLICHE Version in einer Kette je Deal; genau
// eine Version trägt `is_current` ("Aktuelle Bewertungssicht", AC4). Die
// Plattform rechnet nicht — Ergebnis ist die Kaufpreisbandbreite plus ein
// Verweis auf das eigentliche Modell (external_document_links).

import type { MaConfidentialityLevel } from "./confidentiality"

export const VALUATION_METHODS = [
  "multiple",
  "dcf",
  "comparable_transactions",
  "net_asset",
] as const

export type ValuationMethod = (typeof VALUATION_METHODS)[number]

export const VALUATION_METHOD_LABELS: Record<ValuationMethod, string> = {
  multiple: "Multiple",
  dcf: "DCF",
  comparable_transactions: "Vergleichstransaktionen",
  net_asset: "Substanzwert",
}

/** Verknüpfbare Objekte einer Bewertungsversion (AC3). */
export const VALUATION_LINK_KINDS = ["dd_finding"] as const
export type ValuationLinkKind = (typeof VALUATION_LINK_KINDS)[number]

export const VALUATION_LINK_KIND_LABELS: Record<ValuationLinkKind, string> = {
  dd_finding: "DD-Finding",
}

export interface Valuation {
  id: string
  tenant_id: string
  project_id: string
  version_no: number
  supersedes_valuation_id: string | null
  is_current: boolean
  version_comment: string | null
  title: string
  valuation_date: string
  method: ValuationMethod
  value_low: number | null
  value_high: number | null
  currency: string
  assumptions: string | null
  author_user_id: string | null
  confidentiality_level: MaConfidentialityLevel
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ValuationLink {
  id: string
  tenant_id: string
  valuation_id: string
  linked_kind: ValuationLinkKind
  linked_id: string
  note: string | null
  created_by: string | null
  created_at: string
}
