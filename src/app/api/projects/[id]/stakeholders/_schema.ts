/**
 * Stakeholder POST/PATCH Zod schemas — colocated module so the routes
 * AND the drift-tests can both import them.
 *
 * Why a separate file:
 *   - Next.js App Router route files (`route.ts`) only export HTTP-method
 *     handlers; defining the schema here keeps the route file focused on
 *     handler logic.
 *   - The drift-test (route.test.ts) introspects `createSchema.shape` to
 *     assert every schema key is present in the DB insertPayload. This is
 *     how we catch the recurring "field accepted by Zod but silently
 *     dropped before reaching the DB" bug class.
 *
 * Field set (must stay in sync with `_tracked_audit_columns('stakeholders')`
 * in the DB and with the form `formSchema` in
 * `src/components/projects/stakeholders/stakeholder-form.tsx`).
 */

import { z } from "zod"

import {
  COMMUNICATION_NEEDS,
  DECISION_AUTHORITIES,
  MANAGEMENT_LEVELS,
  PREFERRED_CHANNELS,
  STAKEHOLDER_ATTITUDES,
  STAKEHOLDER_KINDS,
  STAKEHOLDER_ORIGINS,
  STAKEHOLDER_SCORES,
} from "@/types/stakeholder"

export const stakeholderCreateSchema = z.object({
  kind: z.enum(STAKEHOLDER_KINDS as unknown as [string, ...string[]]),
  origin: z.enum(STAKEHOLDER_ORIGINS as unknown as [string, ...string[]]),
  name: z.string().trim().min(1).max(255),
  role_key: z.string().max(100).optional().nullable(),
  org_unit: z.string().max(255).optional().nullable(),
  contact_email: z
    .string()
    .email()
    .max(320)
    .optional()
    .nullable()
    .or(z.literal("")),
  contact_phone: z.string().max(64).optional().nullable(),
  influence: z
    .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
    .default("medium"),
  impact: z
    .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
    .default("medium"),
  linked_user_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  // PROJ-33-α qualitative fields — alle nullable, NO_VALUE → null im Form.
  reasoning: z.string().max(5000).optional().nullable(),
  stakeholder_type_key: z.string().max(64).optional().nullable(),
  management_level: z
    .enum(MANAGEMENT_LEVELS as unknown as [string, ...string[]])
    .optional()
    .nullable(),
  decision_authority: z
    .enum(DECISION_AUTHORITIES as unknown as [string, ...string[]])
    .optional()
    .nullable(),
  attitude: z
    .enum(STAKEHOLDER_ATTITUDES as unknown as [string, ...string[]])
    .optional()
    .nullable(),
  conflict_potential: z
    .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
    .optional()
    .nullable(),
  communication_need: z
    .enum(COMMUNICATION_NEEDS as unknown as [string, ...string[]])
    .optional()
    .nullable(),
  preferred_channel: z
    .enum(PREFERRED_CHANNELS as unknown as [string, ...string[]])
    .optional()
    .nullable(),
  // PROJ-31 — eligible-approver flag (DB-default false).
  is_approver: z.boolean().optional(),
})

export const stakeholderPatchSchema = z
  .object({
    kind: z
      .enum(STAKEHOLDER_KINDS as unknown as [string, ...string[]])
      .optional(),
    origin: z
      .enum(STAKEHOLDER_ORIGINS as unknown as [string, ...string[]])
      .optional(),
    name: z.string().trim().min(1).max(255).optional(),
    role_key: z.string().max(100).optional().nullable(),
    org_unit: z.string().max(255).optional().nullable(),
    contact_email: z
      .string()
      .email()
      .max(320)
      .optional()
      .nullable()
      .or(z.literal("")),
    contact_phone: z.string().max(64).optional().nullable(),
    influence: z
      .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
      .optional(),
    impact: z
      .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
      .optional(),
    linked_user_id: z.string().uuid().optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    reasoning: z.string().max(5000).optional().nullable(),
    stakeholder_type_key: z.string().max(64).optional().nullable(),
    management_level: z
      .enum(MANAGEMENT_LEVELS as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    decision_authority: z
      .enum(DECISION_AUTHORITIES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    attitude: z
      .enum(STAKEHOLDER_ATTITUDES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    conflict_potential: z
      .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    communication_need: z
      .enum(COMMUNICATION_NEEDS as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    preferred_channel: z
      .enum(PREFERRED_CHANNELS as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    is_approver: z.boolean().optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

/**
 * Fields that the routes handle explicitly via tenant_id / project_id /
 * created_by / etc. — they are NOT in the Zod schema but ARE in the DB
 * INSERT payload. Drift-tests subtract these from their assertions.
 */
export const STAKEHOLDER_INSERT_SERVER_FIELDS = [
  "tenant_id",
  "project_id",
  "created_by",
] as const

/**
 * Trimmable text fields where empty string should become NULL. Other
 * fields (enums, booleans, UUIDs) pass through unchanged via spread.
 */
const TRIM_FIELDS = [
  "name",
  "role_key",
  "org_unit",
  "contact_email",
  "contact_phone",
  "notes",
  "reasoning",
  "stakeholder_type_key",
] as const

type TrimField = (typeof TRIM_FIELDS)[number]

/**
 * Normalize a parsed stakeholder payload before it goes to the DB:
 * - Trim string fields, convert empty → NULL
 * - Pass everything else (enums, booleans, UUIDs, NULLs) through unchanged
 *
 * Drop-anything-new safety: the spread pattern in the route guarantees
 * that any new schema field flows through automatically. Only newly added
 * trimmable text fields need a TRIM_FIELDS entry, which is a 1-line edit.
 */
export function normalizeStakeholderPayload<
  T extends Partial<Record<TrimField, string | null | undefined>> &
    Record<string, unknown>,
>(data: T): T {
  const out = { ...data } as Record<string, unknown>
  for (const f of TRIM_FIELDS) {
    if (f in out) {
      const v = out[f]
      if (typeof v === "string") {
        const trimmed = v.trim()
        out[f] = trimmed.length === 0 ? null : trimmed
      }
    }
  }
  return out as T
}
