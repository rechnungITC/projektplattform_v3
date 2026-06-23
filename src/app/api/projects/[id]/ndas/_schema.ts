import { z } from "zod"

// PROJ-128 — NDA register (governance object).

export const NDA_STATUSES = [
  "draft",
  "in_review",
  "valid",
  "expired",
  "revoked",
] as const

export const NDA_SCOPE_KINDS = [
  "project",
  "phase",
  "dd_stream",
  "advisor_group",
  "person",
] as const

export const CONFIDENTIALITY_LEVELS = [
  "standard",
  "confidential",
  "strict",
] as const

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const createNdaSchema = z.object({
  counterparty: z.string().trim().min(1).max(200),
  responsible_user_id: z.string().uuid().nullish(),
  status: z.enum(NDA_STATUSES).optional(),
  signed_date: dateString.nullish(),
  valid_from: dateString.nullish(),
  valid_until: dateString.nullish(),
  scope_kind: z.enum(NDA_SCOPE_KINDS).optional(),
  scope_ref: z.string().uuid().nullish(),
  covered_level: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  document_link: z.string().trim().max(2000).nullish(),
  reminder_date: dateString.nullish(),
  notes: z.string().trim().max(4000).nullish(),
})

export const updateNdaSchema = z
  .object({
    counterparty: z.string().trim().min(1).max(200),
    responsible_user_id: z.string().uuid().nullable(),
    status: z.enum(NDA_STATUSES),
    signed_date: dateString.nullable(),
    valid_from: dateString.nullable(),
    valid_until: dateString.nullable(),
    scope_kind: z.enum(NDA_SCOPE_KINDS),
    scope_ref: z.string().uuid().nullable(),
    covered_level: z.enum(CONFIDENTIALITY_LEVELS),
    document_link: z.string().trim().max(2000).nullable(),
    reminder_date: dateString.nullable(),
    notes: z.string().trim().max(4000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const assignNdaSchema = z
  .object({
    user_id: z.string().uuid().nullish(),
    contact_name: z.string().trim().max(200).nullish(),
    contact_org: z.string().trim().max(200).nullish(),
  })
  .refine((v) => Boolean(v.user_id) || Boolean(v.contact_name), {
    message: "Provide a user_id (platform account) or a contact_name.",
    path: ["user_id"],
  })

export const NDA_SELECT =
  "id, tenant_id, project_id, counterparty, responsible_user_id, status, signed_date, valid_from, valid_until, scope_kind, scope_ref, covered_level, document_link, reminder_date, notes, created_by, created_at, updated_at"

export const NDA_ASSIGNMENT_SELECT =
  "id, tenant_id, nda_id, project_id, user_id, contact_name, contact_org, created_by, created_at"
