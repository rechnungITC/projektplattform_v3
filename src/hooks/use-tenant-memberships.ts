"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Tenant, TenantMembership } from "@/types/auth"

interface UseTenantMembershipsResult {
  memberships: TenantMembership[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Fetches all tenant memberships for the given user, joined with their tenants.
 */
export function useTenantMemberships(
  userId: string | null | undefined
): UseTenantMembershipsResult {
  const [memberships, setMemberships] = React.useState<TenantMembership[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(userId))
  const [error, setError] = React.useState<string | null>(null)

  const fetchOnce = React.useCallback(async () => {
    if (!userId) {
      setMemberships([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from("tenant_memberships")
        .select(
          "id, tenant_id, user_id, role, created_at, tenant:tenants ( id, name, domain, created_at, created_by )"
        )
        .eq("user_id", userId)

      if (queryError) {
        setError(queryError.message)
        setMemberships([])
        return
      }

      const normalized = ((data ?? []) as unknown as Array<
        TenantMembership & { tenant: Tenant | Tenant[] }
      >).map((row) => ({
        ...row,
        tenant: Array.isArray(row.tenant) ? row.tenant[0] : row.tenant,
      })) as TenantMembership[]

      setMemberships(normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      setMemberships([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  React.useEffect(() => {
    void fetchOnce()
  }, [fetchOnce])

  return { memberships, loading, error, refresh: fetchOnce }
}
