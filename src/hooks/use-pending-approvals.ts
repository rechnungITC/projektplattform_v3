"use client"

import * as React from "react"

import { listPendingApprovals } from "@/lib/decisions/approval-api"
import type { PendingApprovalSummary } from "@/types/decision-approval"

interface UsePendingApprovalsResult {
  approvals: PendingApprovalSummary[] | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

interface UsePendingApprovalsOptions {
  /**
   * When false, the hook stops fetching. Used by the dashboard to
   * skip the redundant call once `/api/dashboard/summary` has
   * already returned the same approvals payload.
   */
  enabled?: boolean
}

/**
 * PROJ-64 fallback hook — feeds the dashboard Approval Inbox panel
 * directly from the existing PROJ-31 endpoint when the
 * `/api/dashboard/summary` aggregation isn't able to provide the
 * data (404, error, or section-level error envelope).
 *
 * Pass `enabled: false` once the summary owns the section to avoid
 * a second round-trip.
 */
export function usePendingApprovals(
  options: UsePendingApprovalsOptions = {},
): UsePendingApprovalsResult {
  const { enabled = true } = options
  const [approvals, setApprovals] = React.useState<
    PendingApprovalSummary[] | null
  >(null)
  const [isLoading, setIsLoading] = React.useState(enabled)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!enabled) {
      setApprovals(null)
      setIsLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const list = await listPendingApprovals("pending")
        if (cancelled) return
        setApprovals(list)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unknown error")
        setApprovals([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tick, enabled])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { approvals, isLoading, error, refresh }
}