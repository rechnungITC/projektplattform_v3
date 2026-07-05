"use client"

import * as React from "react"

import { listMyDeliverableApprovals } from "@/lib/ma-project/deliverable-approvals-api"
import type { PendingDeliverableApprovalSummary } from "@/types/deliverable-approval-workflow"

interface UseMyDeliverableApprovalsResult {
  approvals: PendingDeliverableApprovalSummary[] | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * PROJ-105 α — feeds the dashboard "Deliverable-Freigaben" panel from
 * /api/dashboard/deliverable-approvals: stages where the current user is the
 * active approver of a still-pending workflow.
 */
export function useMyDeliverableApprovals(): UseMyDeliverableApprovalsResult {
  const [approvals, setApprovals] = React.useState<
    PendingDeliverableApprovalSummary[] | null
  >(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const list = await listMyDeliverableApprovals()
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
  }, [tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { approvals, isLoading, error, refresh }
}
