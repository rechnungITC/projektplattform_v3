import { z } from "zod"

export const MEETING_STATUSES = ["planned", "held", "cancelled"] as const
export const ATTENDANCE_STATES = ["present", "absent", "guest"] as const
export const DOCUMENT_KINDS = ["pre_read", "minutes_attachment"] as const
export const CONFIDENTIALITY_LEVELS = ["standard", "confidential", "strict"] as const

const isoDate = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid ISO timestamp")

export const createMeetingSchema = z.object({
  title: z.string().trim().min(1).max(255),
  scheduled_at: isoDate,
  agenda: z.string().max(20000).optional().nullable(),
  confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS).optional().nullable(),
})

export const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    scheduled_at: isoDate.optional(),
    ended_at: isoDate.optional().nullable(),
    status: z.enum(MEETING_STATUSES).optional(),
    agenda: z.string().max(20000).optional().nullable(),
    minutes: z.string().max(50000).optional().nullable(),
  })
  .refine((o) => Object.keys(o).length > 0, "No fields to update.")

export const setAttendeeSchema = z.object({
  stakeholder_id: z.string().uuid(),
  attendance: z.enum(ATTENDANCE_STATES).optional(),
})

export const addDocumentSchema = z.object({
  label: z.string().trim().min(1).max(255),
  url: z.string().trim().url().max(2000),
  kind: z.enum(DOCUMENT_KINDS).optional(),
})

export const commitMinutesSchema = z.object({
  decisions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(255),
        decision_text: z.string().max(10000).optional().nullable(),
      })
    )
    .max(50)
    .optional(),
  actions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(255),
        responsible_user_id: z.string().uuid().optional().nullable(),
        due_date: z
          .string()
          .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date")
          .optional()
          .nullable(),
        phase_id: z.string().uuid().optional().nullable(),
        workstream_id: z.string().uuid().optional().nullable(),
      })
    )
    .max(50)
    .optional(),
})

export const createTemplateSchema = z.object({
  template_key: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  purpose: z.string().max(2000).optional().nullable(),
  cadence: z.string().max(64).optional().nullable(),
  default_confidentiality: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  default_decision_scope: z.string().max(2000).optional().nullable(),
})
