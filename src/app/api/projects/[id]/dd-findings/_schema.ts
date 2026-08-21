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

// PROJ-Y-114a — Klasse des Herkunftsnachweises. Schliesst PROJ-108 AC1 ("Quelle").
// Der *externe Dokumentenverweis* liegt weiterhin in `external_document_links`
// (PROJ-115) — `source_kind='document'` benennt die Klasse, `source_ref` den
// Fundort im Datenraum; die abrufbare URL bleibt der Link.
export const FINDING_SOURCE_KINDS = [
  "document",
  "qa_answer",
  "interview",
  "site_visit",
  "analysis",
  "other",
] as const

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
  source_kind: z.enum(FINDING_SOURCE_KINDS).nullish(),
  source_ref: z.string().trim().max(500).nullish(),
  source_dd_question_id: z.string().uuid().nullish(),
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
    source_kind: z.enum(FINDING_SOURCE_KINDS).nullable(),
    source_ref: z.string().trim().max(500).nullable(),
    source_dd_question_id: z.string().uuid().nullable(),
    // PROJ-Y-114a: die drei Quell-Felder sind EINE Aussage. `clear_source` verwirft
    // die alte Herkunft und setzt danach nur, was mitgegeben wurde ("Quelle neu
    // benennen"), statt drei Einzel-Loeschschalter zu fuehren.
    clear_source: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const FINDING_SELECT =
  "id, tenant_id, project_id, dd_stream_id, title, description, severity, economic_impact_eur, probability, recommended_treatment, status, linked_risk_id, responsible_user_id, confidentiality_level, source_kind, source_ref, source_dd_question_id, created_by, created_at, updated_at"
