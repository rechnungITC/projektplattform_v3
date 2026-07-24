import { z } from "zod"

// PROJ-118 — communication matrix entries + templates. Shared Zod schemas.

export const CONFIDENTIALITY_LEVELS = ["standard", "confidential", "strict"] as const

const optionalText = z.string().trim().max(8000).nullish()
const optionalShort = z.string().trim().max(200).nullish()
// ISO date (YYYY-MM-DD) — matches the Postgres `date` columns.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .nullish()

export const createEntrySchema = z.object({
  target_group_key: z.string().trim().min(1, "Target group is required.").max(200),
  target_group_label: optionalShort,
  message: optionalText,
  channel: optionalShort,
  planned_date: isoDate,
  responsible_user_id: z.string().uuid().nullish(),
  approver_user_id: z.string().uuid().nullish(),
  confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  template_id: z.string().uuid().nullish(),
  phase_id: z.string().uuid().nullish(),
  stage_gate_id: z.string().uuid().nullish(),
  work_item_id: z.string().uuid().nullish(),
})

// Update mirrors create but every field is optional (partial edit) and there
// is no template_id (templates are only referenced at creation time, matching
// the update_communication_entry RPC signature).
export const updateEntrySchema = z.object({
  target_group_key: z.string().trim().min(1).max(200).nullish(),
  target_group_label: optionalShort,
  message: optionalText,
  channel: optionalShort,
  planned_date: isoDate,
  responsible_user_id: z.string().uuid().nullish(),
  approver_user_id: z.string().uuid().nullish(),
  confidentiality_level: z.enum(CONFIDENTIALITY_LEVELS).nullish(),
  phase_id: z.string().uuid().nullish(),
  stage_gate_id: z.string().uuid().nullish(),
  work_item_id: z.string().uuid().nullish(),
})

export const respondApprovalSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().max(4000).nullish(),
})

export const createTemplateSchema = z.object({
  template_key: z
    .string()
    .trim()
    .min(1, "Template key is required.")
    .max(120),
  name: z.string().trim().min(1, "Name is required.").max(200),
  default_target_group_key: optionalShort,
  default_channel: optionalShort,
  default_confidentiality: z.enum(CONFIDENTIALITY_LEVELS).optional(),
  body_skeleton: optionalText,
})

// Select shape for the confidentiality-gated entry list. RLS + the restrictive
// need-to-know gate scope rows; this is the full row minus nothing sensitive.
export const ENTRY_SELECT =
  "id, tenant_id, project_id, target_group_key, target_group_label, message, channel, " +
  "planned_date, actual_date, responsible_user_id, approver_user_id, approval_status, " +
  "approved_at, rejection_reason, confidentiality_level, template_id, phase_id, " +
  "stage_gate_id, work_item_id, sort_order, created_by, created_at, updated_at"