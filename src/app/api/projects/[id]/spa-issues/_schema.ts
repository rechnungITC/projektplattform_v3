import { z } from "zod"

// PROJ-122 — shared schema/constants for the SPA issues list (Epic J).

export const SPA_ISSUE_STATUSES = [
  "open",
  "in_negotiation",
  "agreed",
  "escalated",
  "closed",
] as const

export const SPA_ISSUE_CATEGORIES = [
  "warranty",
  "indemnity",
  "purchase_price",
  "liability",
  "condition",
  "other",
] as const

export const SPA_ISSUE_IMPORTANCES = [
  "niedrig",
  "mittel",
  "hoch",
  "kritisch",
] as const

export const CONFIDENTIALITY_LEVELS = [
  "standard",
  "confidential",
  "strict",
] as const

// Statuses that count as "still in play" for the stage-gate hint (AC-122-4).
// Mirrors the SQL filter inside stage_gate_prereadiness.
export const SPA_ISSUE_OPEN_STATUSES = ["open", "escalated"] as const

const longText = z.string().trim().max(8000)

export const createSpaIssueSchema = z.object({
  title: z.string().trim().min(1).max(200),
  clause_reference: z.string().trim().max(200).nullish(),
  category: z.enum(SPA_ISSUE_CATEGORIES).optional(),
  own_position: longText.nullish(),
  counterparty_position: longText.nullish(),
  recommended_solution: longText.nullish(),
  risk_if_no_agreement: longText.nullish(),
  importance: z.enum(SPA_ISSUE_IMPORTANCES).optional(),
  responsible_user_id: z.string().uuid().nullish(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.").nullish(),
  linked_finding_id: z.string().uuid().nullish(),
  linked_risk_id: z.string().uuid().nullish(),
  confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS).nullish(),
})

export const updateSpaIssueSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    clause_reference: z.string().trim().max(200).nullable(),
    category: z.enum(SPA_ISSUE_CATEGORIES),
    own_position: longText.nullable(),
    counterparty_position: longText.nullable(),
    recommended_solution: longText.nullable(),
    risk_if_no_agreement: longText.nullable(),
    importance: z.enum(SPA_ISSUE_IMPORTANCES),
    responsible_user_id: z.string().uuid().nullable(),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.")
      .nullable(),
    linked_finding_id: z.string().uuid().nullable(),
    linked_risk_id: z.string().uuid().nullable(),
    confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const transitionSpaIssueSchema = z.object({
  status: z.enum(SPA_ISSUE_STATUSES),
})

export const SPA_ISSUE_SELECT =
  "id, tenant_id, project_id, issue_number, title, clause_reference, category, " +
  "own_position, counterparty_position, recommended_solution, risk_if_no_agreement, " +
  "status, importance, responsible_user_id, due_date, linked_finding_id, linked_risk_id, " +
  "confidentiality_level, created_by, created_at, updated_at"
