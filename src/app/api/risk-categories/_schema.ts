import { z } from "zod"

// PROJ-107 — tenant-scoped risk category catalog (M&A risk register DUP→REUSE).
// `key` is a stable slug used as the reporting group-by axis; `label` is display.
// `applies_to_project_type` null = applies to all project types.

const keyPattern = /^[a-z0-9_]+$/

export const createRiskCategorySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(keyPattern, "Nur Kleinbuchstaben, Ziffern und Unterstrich."),
  label: z.string().trim().min(1).max(120),
  applies_to_project_type: z.string().trim().min(1).max(40).nullish(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
})

export const updateRiskCategorySchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(keyPattern, "Nur Kleinbuchstaben, Ziffern und Unterstrich.")
      .optional(),
    label: z.string().trim().min(1).max(120).optional(),
    applies_to_project_type: z.string().trim().min(1).max(40).nullish(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided.",
  })

export type CreateRiskCategoryInput = z.infer<typeof createRiskCategorySchema>
export type UpdateRiskCategoryInput = z.infer<typeof updateRiskCategorySchema>

export const RISK_CATEGORY_SELECT =
  "id, tenant_id, key, label, applies_to_project_type, sort_order, is_active, created_by, created_at, updated_at"
