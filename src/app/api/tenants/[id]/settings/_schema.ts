/**
 * Tenant-settings PATCH Zod schema — colocated module (PROJ-17 + PROJ-24
 * ST-02). PATCH-only: tenants always have a `tenant_settings` row created
 * by the tenant-bootstrap trigger.
 *
 * Drift-test verifies every top-level key forwards to the DB update payload.
 * Sub-schemas are JSONB columns (active_modules / privacy_defaults /
 * ai_provider_config / retention_overrides / cost_settings) and are passed
 * through unchanged.
 */

import { z } from "zod"

import {
  SUPPORTED_CURRENCIES,
  TOGGLEABLE_MODULES,
  VELOCITY_FACTOR_MAX,
  VELOCITY_FACTOR_MIN,
} from "@/types/tenant-settings"

// PROJ-55-β — single source of truth: `TOGGLEABLE_MODULES` from
// the tenant-settings types module. A local copy here drifted in
// the past (missed `resources` / `budget` / `output_rendering` /
// `organization`, still listed reserved `connectors`). `z.enum`
// needs a non-empty tuple, hence the runtime cast.
const moduleSchema = z.enum(
  TOGGLEABLE_MODULES as unknown as readonly [string, ...string[]],
)

const privacyDefaultsSchema = z.object({
  default_class: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

const aiProviderConfigSchema = z
  .object({
    external_provider: z.enum(["anthropic", "none"]),
    model_id: z.string().min(1).max(100).optional(),
  })
  .strict()

const retentionOverridesSchema = z
  .object({
    audit_log_days: z
      .number()
      .int()
      .min(1)
      .max(3650, "Retention cannot exceed 10 years")
      .optional(),
  })
  .strict()

const costSettingsSchema = z
  .object({
    velocity_factor: z
      .number()
      .min(VELOCITY_FACTOR_MIN, `velocity_factor >= ${VELOCITY_FACTOR_MIN}`)
      .max(VELOCITY_FACTOR_MAX, `velocity_factor <= ${VELOCITY_FACTOR_MAX}`),
    default_currency: z.enum(
      SUPPORTED_CURRENCIES as unknown as [string, ...string[]]
    ),
  })
  .strict()

export const tenantSettingsPatchSchema = z
  .object({
    active_modules: z.array(moduleSchema).optional(),
    privacy_defaults: privacyDefaultsSchema.optional(),
    ai_provider_config: aiProviderConfigSchema.optional(),
    retention_overrides: retentionOverridesSchema.optional(),
    cost_settings: costSettingsSchema.optional(),
  })
  .refine(
    (val) =>
      val.active_modules !== undefined ||
      val.privacy_defaults !== undefined ||
      val.ai_provider_config !== undefined ||
      val.retention_overrides !== undefined ||
      val.cost_settings !== undefined,
    {
      message:
        "Provide at least one of: active_modules, privacy_defaults, ai_provider_config, retention_overrides, cost_settings.",
    }
  )

/**
 * Pass-through normalize. No trim-able strings at the top level — every
 * field is JSONB or an array.
 */
export function normalizeTenantSettingsPayload<
  T extends Record<string, unknown>,
>(data: T): T {
  return { ...data } as T
}
