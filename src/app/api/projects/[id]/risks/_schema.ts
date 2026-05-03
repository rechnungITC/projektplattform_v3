/**
 * Risks POST/PATCH Zod schemas — colocated module so the routes AND the
 * drift-tests can both import them.
 *
 * See `../stakeholders/_schema.ts` for the rationale (drift-detection
 * pattern).
 */

import { z } from "zod"

import { RISK_STATUSES } from "@/types/risk"

export const riskCreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z
    .enum(RISK_STATUSES as unknown as [string, ...string[]])
    .default("open"),
  mitigation: z.string().max(5000).optional().nullable(),
  responsible_user_id: z.string().uuid().optional().nullable(),
})

export const riskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(5000).optional().nullable(),
    probability: z.number().int().min(1).max(5).optional(),
    impact: z.number().int().min(1).max(5).optional(),
    status: z
      .enum(RISK_STATUSES as unknown as [string, ...string[]])
      .optional(),
    mitigation: z.string().max(5000).optional().nullable(),
    responsible_user_id: z.string().uuid().optional().nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const TRIM_FIELDS = ["title", "description", "mitigation"] as const

type TrimField = (typeof TRIM_FIELDS)[number]

export function normalizeRiskPayload<
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
