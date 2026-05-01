"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Profile, Role, TenantMember } from "@/types/auth"

interface UseTenantMembersResult {
  members: TenantMember[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Fetches all members of the given tenant (their profiles + roles).
 */
export function useTenantMembers(
  tenantId: string | null | undefined
): UseTenantMembersResult {
  const [members, setMembers] = React.useState<TenantMember[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(tenantId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!tenantId) {
        if (!cancelled) {
          setMembers([])
          setLoading(false)
        }
        return
      }
      try {
        const supabase = createClient()
        const { data, error: queryError } = await supabase
          .from("tenant_memberships")
          .select(
            "id, user_id, role, created_at, profile:profiles ( id, email, display_name )"
          )
          .eq("tenant_id", tenantId)

        if (cancelled) return
        if (queryError) {
          setError(queryError.message)
          setMembers([])
          return
        }

        type Row = {
          id: string
          user_id: string
          role: Role
          created_at: string
          profile: Pick<Profile, "id" | "email" | "display_name"> | null
        }

        const normalized = ((data ?? []) as unknown as Array<
          Row & { profile: Row["profile"] | Row["profile"][] }
        >).map((row): TenantMember => {
          const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
          return {
            membership_id: row.id,
            user_id: row.user_id,
            email: profile?.email ?? "",
            display_name: profile?.display_name ?? null,
            role: row.role,
            created_at: row.created_at,
          }
        })
        setMembers(normalized)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
          setMembers([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tenantId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { members, loading, error, refresh }
}
