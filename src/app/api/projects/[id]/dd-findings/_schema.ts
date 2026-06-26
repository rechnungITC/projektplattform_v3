import { z } from "zod"

// PROJ-114 — DD-Findings validation.
export const FINDING_SEVERITIES = ["niedrig", "mittel", "hoch", "deal_breaker"] as const
export const FINDING_TREATMENTS = [
  "kaufpreisanpassung",
  "garantie",
  "freistellung",
  "integrationsthema",
  "akzeptiert",
] as const
export const FINDING_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const
export const CONFIDENTIALITY_LEVELS = ["standard", "confidential", "strict"] as const

export const createFindingSchema = z.object({
  dd_stream_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(8000).nullish(),
  severity: z.enum(FINDING_SEVERITIES).optional(),
  economic_impact_eur: z.number().nonnegative().nullish(),
  probability: z.number().int().min(1).max(5).nullish(),
  recommended_treatment: z.enum(FINDING_TREATMENTS).nullish(),
  linked_risk_id: z.string().uuid().nullish(),
  confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS).nullish(),
})

export const updateFindingSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8000).nullable(),
    severity: z.enum(FINDING_SEVERITIES),
    economic_impact_eur: z.number().nonnegative().nullable(),
    clear_eur: z.boolean(),
    probability: z.number().int().min(1).max(5).nullable(),
    recommended_treatment: z.enum(FINDING_TREATMENTS).nullable(),
    status: z.enum(FINDING_STATUSES),
    linked_risk_id: z.string().uuid().nullable(),
    responsible_user_id: z.string().uuid().nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const FINDING_SELECT =
  "id, tenant_id, project_id, dd_stream_id, title, description, severity, economic_impact_eur, probability, recommended_treatment, status, linked_risk_id, responsible_user_id, confidentiality_level, created_by, created_at, updated_at"
