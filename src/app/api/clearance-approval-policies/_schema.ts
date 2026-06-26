import { z } from "zod"

// PROJ-100c — 4-eyes approval policy per (tenant, level). 'standard' is the open
// default and is never gated, so only 'confidential'/'strict' are configurable.
export const upsertPolicySchema = z.object({
  level: z.enum(["confidential", "strict"]),
  enabled: z.boolean(),
  persons_required: z.number().int().min(1).max(10),
})

export type UpsertPolicyInput = z.infer<typeof upsertPolicySchema>

export const POLICY_SELECT =
  "id, tenant_id, level, enabled, persons_required, created_by, created_at, updated_at"
