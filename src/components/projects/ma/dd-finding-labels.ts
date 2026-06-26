import type {
  FindingSeverity,
  FindingStatus,
  FindingTreatment,
} from "@/lib/ma-project/dd-findings-api"

// PROJ-114 — shared German labels + badge variants for DD-Findings.

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  deal_breaker: "Deal Breaker",
}

export const TREATMENT_LABEL: Record<FindingTreatment, string> = {
  kaufpreisanpassung: "Kaufpreisanpassung",
  garantie: "Garantie",
  freistellung: "Freistellung",
  integrationsthema: "Integrationsthema",
  akzeptiert: "Akzeptiert",
}

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Offen",
  in_review: "In Prüfung",
  resolved: "Erledigt",
  dismissed: "Verworfen",
}

export function severityBadgeVariant(
  s: FindingSeverity
): "default" | "secondary" | "destructive" | "outline" {
  if (s === "deal_breaker") return "destructive"
  if (s === "hoch") return "destructive"
  if (s === "mittel") return "secondary"
  return "outline" // niedrig
}

/** de-DE EUR, or em dash for null/undefined. */
export function fmtEur(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value)
}
