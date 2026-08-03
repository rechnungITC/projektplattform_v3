"use client"

import * as React from "react"

import { fetchOperativeReport } from "@/lib/ma-project/operative-report-api"
import type {
  OperativeReport,
  OperativeReportFilters,
} from "@/types/operative-report"

interface UseOperativeReportResult {
  report: OperativeReport | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * PROJ-132 + PROJ-141-γ4/γ5 — live operative reporting bundle for a project.
 * Read-only; need-to-know is enforced server-side by the INVOKER RPC.
 * Filters are threaded in-DB (Option Alpha) — passing new `filters` triggers
 * a re-fetch.
 */
export function useOperativeReport(
  projectId: string,
  filters?: OperativeReportFilters
): UseOperativeReportResult {
  const [report, setReport] = React.useState<OperativeReport | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  const wsId = filters?.workstream_id ?? null
  const ownerId = filters?.owner_id ?? null
  const phaseId = filters?.phase_id ?? null
  const classification = filters?.classification ?? null

  React.useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag for async fetch
    setLoading(true)
    setError(null)
    fetchOperativeReport(projectId, {
      workstream_id: wsId,
      owner_id: ownerId,
      phase_id: phaseId,
      classification,
    })
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
  }, [projectId, tick, wsId, ownerId, phaseId, classification])

  return { report, loading, error, refresh }
}
