import { cookies } from "next/headers"

import { createClient } from "@/lib/supabase/server"
import type { Profile, Tenant, TenantMembership } from "@/types/auth"
import type {
  ResolvedTenantConfig,
  TenantBranding,
  TenantLanguage,
  TenantSettings,
} from "@/types/tenant-settings"

const ACTIVE_TENANT_COOKIE = "active_tenant_id"

export interface ServerAuthSnapshot {
  user: NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]
  >
  profile: Profile | null
  memberships: TenantMembership[]
  initialTenantId: string | null
  /**
   * Resolved tenant + settings snapshot for the currently active tenant.
   * Null when the user has no active tenant (no memberships) or when the
   * lookup failed (e.g. brand-new tenant whose settings row hasn't backfilled
   * yet — the bootstrap trigger covers normal cases).
   */
  tenantConfig: ResolvedTenantConfig | null
}

/**
 * Load auth/profile/memberships server-side for the (app) layout.
 * Returns `null` if the user is not authenticated.
 */
export async function loadServerAuth(): Promise<ServerAuthSnapshot | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [profileRes, membershipsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, display_name, created_at, updated_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("tenant_memberships")
      .select(
        "id, tenant_id, user_id, role, created_at, tenant:tenants ( id, name, domain, created_at, created_by )"
      )
      .eq("user_id", user.id),
  ])

  const memberships = ((membershipsRes.data ?? []) as unknown as Array<
    TenantMembership & { tenant: Tenant | Tenant[] }
  >).map((row) => ({
    ...row,
    tenant: Array.isArray(row.tenant) ? row.tenant[0] : row.tenant,
  })) as TenantMembership[]

  const cookieStore = await cookies()
  const cookieTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null

  const initialTenantId =
    cookieTenantId &&
    memberships.some((m) => m.tenant_id === cookieTenantId)
      ? cookieTenantId
      : memberships[0]?.tenant_id ?? null

  let tenantConfig: ResolvedTenantConfig | null = null
  if (initialTenantId) {
    const [tenantBaseRes, tenantSettingsRes] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, language, branding")
        .eq("id", initialTenantId)
        .maybeSingle(),
      supabase
        .from("tenant_settings")
        .select(
          "tenant_id, active_modules, privacy_defaults, ai_provider_config, retention_overrides, budget_settings, output_rendering_settings, cost_settings, risk_score_overrides, created_at, updated_at"
        )
        .eq("tenant_id", initialTenantId)
        .maybeSingle(),
    ])
    const base = tenantBaseRes.data as
      | {
          id: string
          language: TenantLanguage
          branding: TenantBranding
        }
      | null
    const settings = tenantSettingsRes.data as TenantSettings | null
    if (base && settings) {
      tenantConfig = {
        tenant_id: base.id,
        language: base.language,
        branding: base.branding ?? {},
        settings,
      }
    }
  }

  return {
    user,
    profile: (profileRes.data as Profile | null) ?? null,
    memberships,
    initialTenantId,
    tenantConfig,
  }
}
