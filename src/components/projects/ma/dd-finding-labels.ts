import type {
  FindingSeverity,
  FindingSourceKind,
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

// PROJ-Y-114a — Herkunftsnachweis. Die Reihenfolge ist die des Beweiswerts:
// ein Datenraum-Dokument oder eine schriftliche Q&A-Antwort traegt weiter als
// eine muendliche Auskunft — genau die Unterscheidung, die vorher nur als
// Freitext im Sachverhalt stand.
export const FINDING_SOURCE_KIND_LABEL: Record<FindingSourceKind, string> = {
  document: "Datenraum-Dokument",
  qa_answer: "Q&A-Antwort",
  interview: "Management-Interview",
  site_visit: "Standortbesichtigung",
  analysis: "Eigene Analyse",
  other: "Sonstige",
}

export const FINDING_SOURCE_KINDS: readonly FindingSourceKind[] = [
  "document",
  "qa_answer",
  "interview",
  "site_visit",
  "analysis",
  "other",
] as const

/** „Datenraum-Dokument — VDR 3.4.1" bzw. nur eines von beiden; `null` wenn keine Quelle. */
export function formatFindingSource(
  kind: FindingSourceKind | null | undefined,
  ref: string | null | undefined
): string | null {
  const k = kind ? FINDING_SOURCE_KIND_LABEL[kind] : null
  const r = ref?.trim() ? ref.trim() : null
  if (k && r) return `${k} — ${r}`
  return k ?? r
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
