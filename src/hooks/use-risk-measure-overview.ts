"use client"

import * as React from "react"

import {
  fetchRiskMeasureOverview,
  type RiskMeasureOverview,
} from "@/lib/risks/measure-overview"

interface UseRiskMeasureOverviewResult {
  overview: RiskMeasureOverview | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * PROJ-109 — live measures overview for a project (per-risk measures + coverage
 * flags). Read-only; need-to-know is enforced server-side by the INVOKER RPC.
 */
export function useRiskMeasureOverview(
  projectId: string
): UseRiskMeasureOverviewResult {
  const [overview, setOverview] = React.useState<RiskMeasureOverview | null>(
    null
  )
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag for async fetch
    setLoading(true)
    setError(null)
    fetchRiskMeasureOverview(projectId)
      .then((data) => {
        if (!cancelled) setOverview(data)
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, tick])

  return { overview, loading, error, refresh }
}
