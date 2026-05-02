"use client"

import type { User } from "@supabase/supabase-js"
import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type {
  Profile,
  Role,
  Tenant,
  TenantMembership,
} from "@/types/auth"
import type {
  ResolvedTenantConfig,
  TenantBranding,
  TenantLanguage,
  TenantSettings,
} from "@/types/tenant-settings"

const ACTIVE_TENANT_COOKIE = "active_tenant_id"

interface AuthContextValue {
  user: User
  profile: Profile | null
  memberships: TenantMembership[]
  currentTenant: Tenant | null
  currentRole: Role | null
  /** PROJ-17 — resolved settings + branding + language for the active tenant. */
  tenantSettings: TenantSettings | null
  tenantLanguage: TenantLanguage
  tenantBranding: TenantBranding
  setCurrentTenant: (tenantId: string) => void
  refresh: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  user: User
  initialProfile: Profile | null
  initialMemberships: TenantMembership[]
  initialTenantId: string | null
  /** PROJ-17 — initial tenant+settings snapshot from the server layout. */
  initialTenantConfig: ResolvedTenantConfig | null
  children: React.ReactNode
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split("=")[1]) : null
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return
  // 1 year, lax, root path. Not HttpOnly because it's a UI hint, not a secret.
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
}

export function AuthProvider({
  user,
  initialProfile,
  initialMemberships,
  initialTenantId,
  initialTenantConfig,
  children,
}: AuthProviderProps) {
  const [profile, setProfile] = React.useState<Profile | null>(initialProfile)
  const [memberships, setMemberships] =
    React.useState<TenantMembership[]>(initialMemberships)
  const [tenantConfig, setTenantConfig] =
    React.useState<ResolvedTenantConfig | null>(initialTenantConfig)

  const [currentTenantId, setCurrentTenantId] = React.useState<string | null>(
    () => {
      const fromCookie = readCookie(ACTIVE_TENANT_COOKIE)
      if (
        fromCookie &&
        initialMemberships.some((m) => m.tenant_id === fromCookie)
      ) {
        return fromCookie
      }
      return initialTenantId ?? initialMemberships[0]?.tenant_id ?? null
    }
  )

  // If the cookie didn't exist server-side, persist whatever we landed on.
  React.useEffect(() => {
    if (currentTenantId) {
      writeCookie(ACTIVE_TENANT_COOKIE, currentTenantId)
    }
  }, [currentTenantId])

  const setCurrentTenant = React.useCallback(
    (tenantId: string) => {
      if (!memberships.some((m) => m.tenant_id === tenantId)) return
      writeCookie(ACTIVE_TENANT_COOKIE, tenantId)
      setCurrentTenantId(tenantId)
    },
    [memberships]
  )

  const refresh = React.useCallback(async () => {
    const supabase = createClient()
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

    if (profileRes.data) {
      setProfile(profileRes.data as Profile)
    }
    if (membershipsRes.data) {
      // Supabase typings give us tenant as an array on join — flatten it.
      const normalized = (membershipsRes.data as unknown as Array<
        TenantMembership & { tenant: Tenant | Tenant[] }
      >).map((row) => ({
        ...row,
        tenant: Array.isArray(row.tenant) ? row.tenant[0] : row.tenant,
      })) as TenantMembership[]
      setMemberships(normalized)

      // If currently-selected tenant disappeared, fall back to the first.
      if (
        currentTenantId &&
        !normalized.some((m) => m.tenant_id === currentTenantId)
      ) {
        setCurrentTenantId(normalized[0]?.tenant_id ?? null)
      }
    }

    // PROJ-17: refresh tenant_settings + branding for the active tenant.
    if (currentTenantId) {
      const [tenantBaseRes, tenantSettingsRes] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, language, branding")
          .eq("id", currentTenantId)
          .maybeSingle(),
        supabase
          .from("tenant_settings")
          .select(
            "tenant_id, active_modules, privacy_defaults, ai_provider_config, retention_overrides, budget_settings, output_rendering_settings, cost_settings, risk_score_overrides, created_at, updated_at"
          )
          .eq("tenant_id", currentTenantId)
          .maybeSingle(),
      ])
      const base = tenantBaseRes.data as
        | { id: string; language: TenantLanguage; branding: TenantBranding }
        | null
      const settings = tenantSettingsRes.data as TenantSettings | null
      if (base && settings) {
        setTenantConfig({
          tenant_id: base.id,
          language: base.language,
          branding: base.branding ?? {},
          settings,
        })
      } else if (!settings) {
        // Tenant exists but settings missing (RLS-hidden for non-admins).
        // Keep the previous snapshot or null out so consumers fail open.
        setTenantConfig(null)
      }
    } else {
      setTenantConfig(null)
    }
  }, [user.id, currentTenantId])

  const currentMembership = React.useMemo(
    () => memberships.find((m) => m.tenant_id === currentTenantId) ?? null,
    [memberships, currentTenantId]
  )

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      memberships,
      currentTenant: currentMembership?.tenant ?? null,
      currentRole: currentMembership?.role ?? null,
      tenantSettings: tenantConfig?.settings ?? null,
      tenantLanguage: tenantConfig?.language ?? "de",
      tenantBranding: tenantConfig?.branding ?? {},
      setCurrentTenant,
      refresh,
    }),
    [
      user,
      profile,
      memberships,
      currentMembership,
      tenantConfig,
      setCurrentTenant,
      refresh,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used inside an AuthProvider")
  }
  return ctx
}
