import { cookies } from "next/headers"

import { createClient } from "@/lib/supabase/server"
import type { Profile, Tenant, TenantMembership } from "@/types/auth"

const ACTIVE_TENANT_COOKIE = "active_tenant_id"

export interface ServerAuthSnapshot {
  user: NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]
  >
  profile: Profile | null
  memberships: TenantMembership[]
  initialTenantId: string | null
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

  return {
    user,
    profile: (profileRes.data as Profile | null) ?? null,
    memberships,
    initialTenantId,
  }
}
