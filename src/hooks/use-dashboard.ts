"use client"

import * as React from "react"

import {
  emptyEnvelope,
  type DashboardSummary,
} from "@/types/dashboard"

interface UseDashboardResult {
  summary: DashboardSummary | null
  isLoading: boolean
  /** Set when the whole call failed (network / 5xx). Section-level
   *  failures live inside `summary.<section>.state === 'error'`. */
  error: string | null
  /** True when the backend aggregation endpoint is not yet shipped
   *  (HTTP 404). The dashboard renders all panels in
   *  `unavailable` state in that case. */
  backendPending: boolean
  refresh: () => Promise<void>
  /** Refresh a single section after a section-level retry click. */
  refreshSection: (section: keyof DashboardSummary) => Promise<void>
}

interface DashboardSummaryEnvelope {
  summary: DashboardSummary
}

interface DashboardErrorEnvelope {
  error?: { code?: string; message?: string }
}

/**
 * PROJ-64 — fetches the global dashboard aggregation.
 *
 * Single primary call: `GET /api/dashboard/summary`.
 *
 * The backend slice (PROJ-64-β) ships this endpoint. Until it
 * lands the hook handles 404 gracefully via `backendPending=true`
 * so the page can still render its shell with section-level
 * "noch nicht verfügbar" placeholders. Once the endpoint exists,
 * normal section-envelope rendering takes over without any
 * frontend change.
 *
 * `refreshSection` always re-runs the full summary; section-level
 * retry granularity is a backend concern and the wire-format
 * already returns each section independently.
 */
export function useDashboard(): UseDashboardResult {
  const [summary, setSummary] = React.useState<DashboardSummary | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [backendPending, setBackendPending] = React.useState(false)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/dashboard/summary", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        })
        if (cancelled) return

        if (res.status === 404) {
          // Backend slice not yet deployed. Fall back to a stub
          // payload that keeps every section in 'unavailable' state.
          setBackendPending(true)
          setSummary(stubSummary())
          return
        }
        if (!res.ok) {
          let message = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as DashboardErrorEnvelope
            message = body.error?.message ?? message
          } catch {
            // ignore body parse errors
          }
          setError(message)
          setSummary(null)
          return
        }
        const body = (await res.json()) as DashboardSummaryEnvelope
        setBackendPending(false)
        setSummary(body.summary)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unknown error")
        setSummary(null)
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

  const refreshSection = React.useCallback(
    async (_section: keyof DashboardSummary) => {
      // V1: re-runs the full summary. Section-level granularity can
      // be added later if the aggregation endpoint becomes slow.
      setTick((t) => t + 1)
    },
    [],
  )

  return {
    summary,
    isLoading,
    error,
    backendPending,
    refresh,
    refreshSection,
  }
}

/**
 * Minimal stub used while the aggregation endpoint is still being
 * built. Every section renders `unavailable` and the page never
 * crashes.
 */
function stubSummary(): DashboardSummary {
  return {
    user_context: {
      user_id: "",
      tenant_id: "",
      is_tenant_admin: false,
    },
    generated_at: new Date().toISOString(),
    kpis: {
      open_assigned: 0,
      overdue: 0,
      pending_approvals: 0,
      at_risk_projects: 0,
    },
    my_work: emptyEnvelope("unavailable"),
    approvals: emptyEnvelope("unavailable"),
    project_health: emptyEnvelope("unavailable"),
    alerts: emptyEnvelope("unavailable"),
    reports: emptyEnvelope("unavailable"),
    capabilities: {
      can_create_project: false,
      can_create_work_item: false,
      can_open_approvals: true,
      can_open_reports: false,
    },
  }
}