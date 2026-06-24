/**
 * PROJ-99 / 128 / 129 — shared German label maps + small format helpers for the
 * confidentiality-bundle UI (advisors, NDA register, access-explain matrix).
 * Kept in one module so the three tabs render the same wording for shared enums
 * (confidentiality level, mandate/NDA status).
 */

import type {
  AccessReason,
  AdvisorType,
  MandateStatus,
  NdaScopeKind,
  NdaStatus,
} from "@/lib/ma-project/advisor-nda-api"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

/**
 * Minimal member shape the governance tabs need for pickers + name lookup.
 * `useTenantMembers` returns a superset; this stays structurally compatible
 * without importing a non-exported hook type.
 */
export interface GovernanceMember {
  user_id: string
  email: string
  display_name: string | null
}

export const LEVEL_LABEL: Record<MaConfidentialityLevel, string> = {
  standard: "Standard",
  confidential: "Vertraulich",
  strict: "Streng vertraulich",
}

export const ADVISOR_TYPE_LABEL: Record<AdvisorType, string> = {
  legal: "Legal",
  tax: "Tax",
  financial: "Financial",
  commercial: "Commercial",
  it: "IT",
  hr: "HR",
  other: "Sonstige",
}

export const MANDATE_STATUS_LABEL: Record<MandateStatus, string> = {
  planned: "Geplant",
  active: "Aktiv",
  expired: "Abgelaufen",
  blocked: "Gesperrt",
}

export const NDA_STATUS_LABEL: Record<NdaStatus, string> = {
  draft: "Entwurf",
  in_review: "In Prüfung",
  valid: "Gültig",
  expired: "Abgelaufen",
  revoked: "Widerrufen",
}

export const NDA_SCOPE_LABEL: Record<NdaScopeKind, string> = {
  project: "Projekt",
  phase: "Phase",
  dd_stream: "DD-Stream",
  advisor_group: "Beratergruppe",
  person: "Person",
}

export const ACCESS_REASON_LABEL: Record<AccessReason, string> = {
  baseline: "Baseline (alle Mitglieder)",
  admin: "Admin (Vollzugriff)",
  cleared: "Freischaltung",
  no_clearance: "Keine Freischaltung",
  mandate_inactive: "Mandat inaktiv/abgelaufen",
  nda_missing: "NDA fehlt/abgelaufen",
}

/** Status colors for badges — green = ok/active, amber = pending, red = blocked. */
export function mandateBadgeVariant(
  status: MandateStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default"
  if (status === "planned") return "secondary"
  return "destructive" // expired | blocked
}

export function ndaBadgeVariant(
  status: NdaStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "valid") return "default"
  if (status === "draft" || status === "in_review") return "secondary"
  return "destructive" // expired | revoked
}

/** de-DE short date, or em dash for null. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}