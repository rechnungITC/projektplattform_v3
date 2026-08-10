import type {
  SpaConfidentialityLevel,
  SpaIssue,
  SpaIssueCategory,
  SpaIssueImportance,
  SpaIssueStatus,
} from "@/lib/ma-project/spa-issues-api"

// PROJ-122 — German labels + badge mapping for the SPA issues list.

export const SPA_ISSUE_STATUS_LABEL: Record<SpaIssueStatus, string> = {
  open: "Offen",
  in_negotiation: "In Verhandlung",
  agreed: "Geeinigt",
  escalated: "Eskaliert",
  closed: "Geschlossen",
}

export const SPA_ISSUE_CATEGORY_LABEL: Record<SpaIssueCategory, string> = {
  warranty: "Garantie",
  indemnity: "Freistellung",
  purchase_price: "Kaufpreis",
  liability: "Haftung",
  condition: "Bedingung",
  other: "Sonstiges",
}

export const SPA_ISSUE_IMPORTANCE_LABEL: Record<SpaIssueImportance, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
  kritisch: "Kritisch",
}

export const SPA_CONFIDENTIALITY_LABEL: Record<SpaConfidentialityLevel, string> =
  {
    standard: "Standard",
    confidential: "Vertraulich",
    strict: "Streng vertraulich",
  }

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

export function statusBadgeVariant(status: SpaIssueStatus): BadgeVariant {
  switch (status) {
    case "escalated":
      return "destructive"
    case "agreed":
    case "closed":
      return "secondary"
    case "in_negotiation":
      return "default"
    default:
      return "outline"
  }
}

export function importanceBadgeVariant(
  importance: SpaIssueImportance
): BadgeVariant {
  switch (importance) {
    case "kritisch":
      return "destructive"
    case "hoch":
      return "default"
    case "mittel":
      return "secondary"
    default:
      return "outline"
  }
}

/**
 * Statuses that still block a clean signing. Mirrors the SQL filter inside
 * `stage_gate_prereadiness` so the list header and the stage-gate pre-read
 * can never disagree about what "open" means.
 */
export const SPA_OPEN_STATUSES: readonly SpaIssueStatus[] = ["open", "escalated"]

export function isOpenSpaIssue(issue: Pick<SpaIssue, "status">): boolean {
  return SPA_OPEN_STATUSES.includes(issue.status)
}

/** "I-3" style display number used by Legal across negotiation rounds. */
export function spaIssueRef(issue: Pick<SpaIssue, "issue_number">): string {
  return `I-${issue.issue_number}`
}
