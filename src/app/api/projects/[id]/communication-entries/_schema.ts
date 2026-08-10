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

// Select shape for the confidentiality-gated entry list. RLS + the two
// restrictive gates (need-to-know + PROJ-119 inner circle) scope the rows.
export const ENTRY_SELECT =
  "id, tenant_id, project_id, target_group_key, target_group_label, message, channel, " +
  "planned_date, actual_date, responsible_user_id, approver_user_id, approval_status, " +
  "approved_at, rejection_reason, confidentiality_level, template_id, phase_id, " +
  "stage_gate_id, work_item_id, sort_order, created_by, created_at, updated_at, " +
  "is_inner_circle, embargo_at"

// ── PROJ-119 ───────────────────────────────────────────────────────────────

export const setInnerCircleSchema = z.object({ enabled: z.boolean() })

export const innerCircleMemberSchema = z.object({
  user_id: z.string().uuid("A valid user id is required."),
})

export const dissolveInnerCircleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required to dissolve an inner circle.")
    .max(100, "The reason may be at most 100 characters."),
})

export const setEmbargoSchema = z.object({
  // null clears the embargo. Full timestamp (not just a date): signing
  // embargoes are hour-precise and cross-timezone.
  embargo_at: z.string().datetime({ offset: true }).nullable(),
})

/**
 * PROJ-119 B2 — an inner-circle entry must NOT ship its content in the list
 * response. Otherwise the "every access to inner-circle content is logged"
 * guarantee would be false the moment the page mounts: the text would already
 * be on the client, unlogged. Callers fetch the body through the dedicated,
 * logged `/content` endpoint instead.
 *
 * The row itself is still visible — RLS already decided that. This only strips
 * the payload so that reading it becomes an explicit, auditable act.
 */
export function redactInnerCircleContent<
  T extends { is_inner_circle?: boolean | null; message?: string | null },
>(row: T): T & { has_message: boolean } {
  const hasMessage = Boolean(row.message && row.message.trim().length > 0)
  if (!row.is_inner_circle) return { ...row, has_message: hasMessage }
  return { ...row, message: null, has_message: hasMessage }
}