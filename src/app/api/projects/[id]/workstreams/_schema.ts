import { z } from "zod"

// PROJ-102 — Workstream instance per (project, workstream_key).

export const WORKSTREAM_RAG_STATUSES = ["green", "amber", "red"] as const

const workstreamKey = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9_]{1,40}$/,
    "workstream_key must be lowercase a-z0-9_ (2-41 chars)"
  )

const levels = ["standard", "confidential", "strict"] as const

export const createWorkstreamSchema = z.object({
  workstream_key: workstreamKey,
  label: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(4000).nullish(),
  lead_user_id: z.string().uuid().nullish(),
  rag_status: z.enum(WORKSTREAM_RAG_STATUSES).optional(),
  scope: z.string().trim().max(4000).nullish(),
  notes: z.string().trim().max(4000).nullish(),
  confidentiality_level: z.enum(levels).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

export const updateWorkstreamSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    goal: z.string().trim().max(4000).nullable(),
    lead_user_id: z.string().uuid().nullable(),
    rag_status: z.enum(WORKSTREAM_RAG_STATUSES),
    scope: z.string().trim().max(4000).nullable(),
    notes: z.string().trim().max(4000).nullable(),
    confidentiality_level: z.enum(levels),
    sort_order: z.number().int().min(0).max(9999),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const setWorkstreamPhasesSchema = z.object({
  phase_ids: z.array(z.string().uuid()).max(100),
})

export const WORKSTREAM_SELECT =
  "id, tenant_id, project_id, workstream_key, label, goal, lead_user_id, rag_status, scope, notes, confidentiality_level, sort_order, created_by, created_at, updated_at"
