import { z } from "zod"

// PROJ-113 — DD question (Q&A) under a DD stream.

export const DD_QUESTION_STATUSES = [
  "open",
  "in_answering",
  "answered",
  "followup",
  "closed",
] as const

export const DD_QUESTION_PRIORITIES = ["low", "medium", "high"] as const

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .regex(/^https?:\/\//i, "Link must start with http(s)://")
const levels = ["standard", "confidential", "strict"] as const

export const createDdQuestionSchema = z.object({
  dd_stream_id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(8000).nullish(),
  addressee: z.string().trim().max(300).nullish(),
  priority: z.enum(DD_QUESTION_PRIORITIES).optional(),
  due_date: dateString.nullish(),
  responsible_user_id: z.string().uuid().nullish(),
  confidentiality_level: z.enum(levels).optional(),
})

export const updateDdQuestionSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    detail: z.string().trim().max(8000).nullable(),
    addressee: z.string().trim().max(300).nullable(),
    priority: z.enum(DD_QUESTION_PRIORITIES),
    due_date: dateString.nullable(),
    responsible_user_id: z.string().uuid().nullable(),
    confidentiality_level: z.enum(levels),
    // answer fields (set when answering / re-answering)
    answer_text: z.string().trim().max(8000).nullable(),
    answer_link: httpUrl.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export const transitionDdQuestionSchema = z.object({
  to_status: z.enum(DD_QUESTION_STATUSES),
  comment: z.string().trim().max(2000).nullish(),
})

export const DD_QUESTION_SELECT =
  "id, tenant_id, project_id, dd_stream_id, title, detail, addressee, priority, due_date, responsible_user_id, status, answer_text, answer_link, answered_at, answered_by, answer_round, confidentiality_level, created_by, created_at, updated_at"