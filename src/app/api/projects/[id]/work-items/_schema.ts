/**
 * Work-items POST/PATCH Zod schemas — colocated module so the routes AND
 * the drift-tests can both import them.
 *
 * Note: work_items PATCH (`[wid]/route.ts`) was already spread-safe before
 * this extraction (uses `{ ...parsed.data }` directly). The colocated
 * schema makes the drift-test regression-proof against future refactors
 * that might re-introduce explicit field-by-field mappings.
 *
 * `attributes` is a JSONB-typed field that holds dynamic per-kind extras
 * (story_points, estimated_duration_days, planned_start, planned_end,
 * estimate_hours, …). The schema validates only that it's a plain
 * record — runtime-shape-validation is the caller's responsibility.
 */

import { z } from "zod"

import { WORK_ITEM_KINDS } from "@/types/work-item"

const WORK_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const
const WORK_ITEM_PRIORITIES = ["low", "medium", "high", "critical"] as const
const WBS_CODE_REGEX = /^[A-Za-z0-9._-]{1,50}$/

export const workItemCreateSchema = z.object({
  kind: z.enum(WORK_ITEM_KINDS as unknown as [string, ...string[]]),
  parent_id: z.string().uuid().nullable().optional(),
  phase_id: z.string().uuid().nullable().optional(),
  milestone_id: z.string().uuid().nullable().optional(),
  sprint_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.enum(WORK_ITEM_PRIORITIES).optional(),
  responsible_user_id: z.string().uuid().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  position: z.number().optional(),
  created_from_proposal_id: z.string().uuid().nullable().optional(),
})

// PATCH: master data updates. NOT status (use /status), NOT parent_id (use
// /parent). `kind` is allowed (admin re-classification — see ChangeKindDialog).
export const workItemPatchSchema = z
  .object({
    kind: z
      .enum(WORK_ITEM_KINDS as unknown as [string, ...string[]])
      .optional(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(10000).nullable().optional(),
    priority: z.enum(WORK_ITEM_PRIORITIES).optional(),
    responsible_user_id: z.string().uuid().nullable().optional(),
    sprint_id: z.string().uuid().nullable().optional(),
    phase_id: z.string().uuid().nullable().optional(),
    milestone_id: z.string().uuid().nullable().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
    position: z.number().optional(),
    is_deleted: z.boolean().optional(),
    // PROJ-36 Phase 36-α — manual WBS-Code override + reset-to-auto.
    wbs_code: z
      .string()
      .regex(WBS_CODE_REGEX, "Ungültiger WBS-Code (nur A-Z, 0-9, . _ -, max 50)")
      .nullable()
      .optional(),
    wbs_code_is_custom: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })
