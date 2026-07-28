import { z } from "zod"

// PROJ-104 — Deliverable per project (anchored to phase and/or workstream).

export const DELIVERABLE_STATUSES = [
  "planned",
  "in_progress",
  "in_review",
  "approved",
  "suspended",
] as const

// Statuses PROJ-104 may transition TO. `approved` is owned by PROJ-105.
export const DELIVERABLE_TRANSITION_TARGETS = [
  "planned",
  "in_progress",
  "in_review",
  "suspended",
] as const

const levels = ["standard", "confidential", "strict"] as const
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const createDeliverableSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8000).nullish(),
    phase_id: z.string().uuid().nullish(),
    workstream_id: z.string().uuid().nullish(),
    responsible_user_id: z.string().uuid().nullish(),
    due_date: dateString.nullish(),
    status: z.enum(DELIVERABLE_STATUSES).optional(),
    confidentiality_level: z.enum(levels).optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
  })
  .refine((v) => Boolean(v.phase_id) || Boolean(v.workstream_id), {
    message: "Ein Deliverable braucht mindestens eine Phase oder einen Workstream.",
    path: ["phase_id"],
  })

export const updateDeliverableSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(8000).nullable(),
    phase_id: z.string().uuid().nullable(),
    workstream_id: z.string().uuid().nullable(),
    responsible_user_id: z.string().uuid().nullable(),
    due_date: dateString.nullable(),
    confidentiality_level: z.enum(levels),
    sort_order: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const transitionDeliverableSchema = z.object({
  to_status: z.enum(DELIVERABLE_TRANSITION_TARGETS),
})

export const createDeliverableDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  tag_keys: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
})

// PROJ-106 — new document version (atomic supersede via RPC). supersedes_document_id
// null = first version of a new slot; set = new version superseding the current head.
export const createDeliverableDocumentVersionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  supersedes_document_id: z.string().uuid().nullable().optional(),
  version_comment: z.string().trim().max(1000).nullable().optional(),
  tag_keys: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
})

// PROJ-106 — link a document version to a PROJ-105 approval event (AC5).
export const stampDeliverableDocumentVersionSchema = z.object({
  document_id: z.string().uuid(),
  event_id: z.string().uuid(),
})

export const DELIVERABLE_SELECT =
  "id, tenant_id, project_id, name, description, phase_id, workstream_id, responsible_user_id, due_date, status, confidentiality_level, sort_order, created_by, created_at, updated_at"
