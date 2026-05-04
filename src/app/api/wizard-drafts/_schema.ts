/**
 * Wizard-drafts POST/PATCH Zod schemas — colocated module so the
 * collection AND single-id routes can share the inner WizardData shape.
 *
 * Why a separate file:
 *   - Eliminates the duplicate `wizardDataSchema` definition that
 *     previously lived in BOTH route.ts files.
 *   - Drift-tests verify that every wizardDataSchema key reaches the
 *     `data` JSONB column AND that the denormalized columns (name,
 *     project_type, project_method) are extracted correctly.
 *
 * Note: this route does NOT use the standard spread pattern. The `data`
 * JSONB column stores the full WizardData blob; `name`, `project_type`,
 * `project_method` are denormalized from `data` for indexed access.
 */

import { z } from "zod"

import { PROJECT_METHODS } from "@/types/project-method"
import { PROJECT_TYPES } from "@/types/project"

export const wizardDataSchema = z
  .object({
    name: z.string().max(255).optional().default(""),
    description: z.string().max(5000).optional().default(""),
    project_number: z.string().max(100).optional().default(""),
    planned_start_date: z.string().nullable().optional().default(null),
    planned_end_date: z.string().nullable().optional().default(null),
    responsible_user_id: z.string().uuid().optional().nullable(),
    project_type: z
      .enum(PROJECT_TYPES as unknown as [string, ...string[]])
      .nullable()
      .optional()
      .default(null),
    project_method: z
      .enum(PROJECT_METHODS as unknown as [string, ...string[]])
      .nullable()
      .optional()
      .default(null),
    type_specific_data: z
      .record(z.string(), z.string())
      .optional()
      .default({}),
  })
  .passthrough()

export const wizardDraftCreateSchema = z.object({
  tenant_id: z.string().uuid(),
  data: wizardDataSchema,
})

export const wizardDraftPatchSchema = z.object({
  data: wizardDataSchema,
  /**
   * Optimistic concurrency token (PROJ-5 spec § "Two browser tabs").
   * If provided and the row's current `updated_at` is different, the API
   * returns 409 with the current row so the client can offer "reload draft".
   * Omit to opt into last-write-wins.
   */
  expected_updated_at: z.string().optional(),
})
