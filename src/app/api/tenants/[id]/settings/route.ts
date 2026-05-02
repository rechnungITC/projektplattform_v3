import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"
import {
  SUPPORTED_CURRENCIES,
  VELOCITY_FACTOR_MAX,
  VELOCITY_FACTOR_MIN,
} from "@/types/tenant-settings"

// PROJ-17 — GET/PATCH /api/tenants/[id]/settings
//
// Admin-only configuration surface for module gating, privacy defaults,
// AI-provider selection, retention overrides, and (PROJ-24 ST-02) cost-stack
// defaults. RLS additionally enforces tenant_admin (with the same predicate
// as `requireTenantAdmin`) — this route fails fast with a friendly 403
// instead of leaking RLS-shape errors.

const SELECT_COLUMNS =
  "tenant_id, active_modules, privacy_defaults, ai_provider_config, retention_overrides, cost_settings, created_at, updated_at"

const TOGGLEABLE_MODULES = [
  "risks",
  "decisions",
  "ai_proposals",
  "audit_reports",
  "connectors",
  "vendor",
  "communication",
] as const

const moduleSchema = z.enum(TOGGLEABLE_MODULES)

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

// PROJ-24 ST-02 — cost-settings JSONB column.
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

const settingsPatchSchema = z
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

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_settings")
    .select(SELECT_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Tenant settings not found.", 404)
  }
  return NextResponse.json({ settings: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = settingsPatchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const updates: Record<string, unknown> = {}
  if (parsed.data.active_modules !== undefined)
    updates.active_modules = parsed.data.active_modules
  if (parsed.data.privacy_defaults !== undefined)
    updates.privacy_defaults = parsed.data.privacy_defaults
  if (parsed.data.ai_provider_config !== undefined)
    updates.ai_provider_config = parsed.data.ai_provider_config
  if (parsed.data.retention_overrides !== undefined)
    updates.retention_overrides = parsed.data.retention_overrides
  if (parsed.data.cost_settings !== undefined)
    updates.cost_settings = parsed.data.cost_settings

  const { data, error } = await supabase
    .from("tenant_settings")
    .update(updates)
    .eq("tenant_id", tenantId)
    .select(SELECT_COLUMNS)
    .maybeSingle()

  if (error) {
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Tenant settings not found.", 404)
  }

  return NextResponse.json({ settings: data })
}
