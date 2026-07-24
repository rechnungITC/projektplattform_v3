"use client"

import * as React from "react"

import { fetchStorageQuota } from "@/lib/dms/api"
import type { QuotaStatus } from "@/types/dms"

interface UseStorageQuotaResult {
  quota: QuotaStatus | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * PROJ-79-α — reads the tenant storage-quota status for a project (feeds the
 * quota bar). Backed by the member-readable `dms_quota_status` RPC.
 */
export function useStorageQuota(
  projectId: string | null | undefined,
): UseStorageQuotaResult {
  const [quota, setQuota] = React.useState<QuotaStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setQuota(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setQuota(await fetchStorageQuota(projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte Kontingent nicht laden.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setQuota(null)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const q = await fetchStorageQuota(projectId)
        if (!cancelled) setQuota(q)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Konnte Kontingent nicht laden.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { quota, loading, error, refresh: load }
}
