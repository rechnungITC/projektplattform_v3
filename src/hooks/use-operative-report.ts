"use client"

import * as React from "react"

import { fetchOperativeReport } from "@/lib/ma-project/operative-report-api"
import type { OperativeReport } from "@/types/operative-report"

interface UseOperativeReportResult {
  report: OperativeReport | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * PROJ-132 — live operative reporting bundle for a project (overdue tasks,
 * findings by severity, Q&A status, deliverable status + weekly pre-read).
 * Read-only; need-to-know is enforced server-side by the INVOKER RPC.
 */
export function useOperativeReport(projectId: string): UseOperativeReportResult {
  const [report, setReport] = React.useState<OperativeReport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag for async fetch
    setLoading(true)
    setError(null)
    fetchOperativeReport(projectId)
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
