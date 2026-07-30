"use client"

import * as React from "react"

import { fetchSteeringReport } from "@/lib/ma-project/steering-report-api"
import type { SteeringReport } from "@/types/steering-report"

interface UseSteeringReportResult {
  report: SteeringReport | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * PROJ-131 — live steering reporting bundle for a project (deal status, next
 * stage gate, red flags [DD-findings + high risks], critical tasks + a steering
 * pre-read). Read-only; need-to-know is enforced server-side by the INVOKER RPC.
 */
export function useSteeringReport(projectId: string): UseSteeringReportResult {
  const [report, setReport] = React.useState<SteeringReport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag for async fetch
    setLoading(true)
    setError(null)
    fetchSteeringReport(projectId)
      .then((data) => {
        if (!cancelled) setReport(data)
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

  return { report, loading, error, refresh }
}
