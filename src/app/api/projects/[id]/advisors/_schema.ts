import { z } from "zod"

// PROJ-99 — external advisor profile per (project, user).

export const ADVISOR_TYPES = [
  "legal",
  "tax",
  "financial",
  "commercial",
  "it",
  "hr",
  "other",
] as const

export const MANDATE_STATUSES = [
  "planned",
  "active",
  "expired",
  "blocked",
] as const

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const createAdvisorSchema = z.object({
  user_id: z.string().uuid(),
  organization: z.string().trim().min(1).max(200),
  advisor_type: z.enum(ADVISOR_TYPES),
  mandate_start: dateString.nullish(),
  mandate_end: dateString.nullish(),
  mandate_status: z.enum(MANDATE_STATUSES).optional(),
  responsible_user_id: z.string().uuid().nullish(),
  scope: z.string().trim().max(2000).nullish(),
  notes: z.string().trim().max(4000).nullish(),
})

export const updateAdvisorSchema = z
  .object({
    organization: z.string().trim().min(1).max(200),
    advisor_type: z.enum(ADVISOR_TYPES),
    mandate_start: dateString.nullable(),
    mandate_end: dateString.nullable(),
    mandate_status: z.enum(MANDATE_STATUSES),
    responsible_user_id: z.string().uuid().nullable(),
    scope: z.string().trim().max(2000).nullable(),
    notes: z.string().trim().max(4000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const ADVISOR_SELECT =
  "id, tenant_id, project_id, user_id, organization, advisor_type, mandate_start, mandate_end, mandate_status, responsible_user_id, scope, notes, created_by, created_at, updated_at"
