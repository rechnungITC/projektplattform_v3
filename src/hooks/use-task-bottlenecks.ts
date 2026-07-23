"use client"

import * as React from "react"

import {
  fetchTaskBottlenecks,
  type TaskBottleneckOverview,
} from "@/lib/work-items/task-bottlenecks"

interface UseTaskBottlenecksResult {
  overview: TaskBottleneckOverview | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * PROJ-103 — live cross-workstream bottleneck overview for a project (open tasks
 * with workstream/phase labels, days-overdue, buckets + Top-3). Read-only;
 * need-to-know is enforced server-side by the INVOKER RPC.
 */
export function useTaskBottlenecks(
  projectId: string
): UseTaskBottlenecksResult {
  const [overview, setOverview] =
    React.useState<TaskBottleneckOverview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  React.useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot loading flag for async fetch
    setLoading(true)
    setError(null)
    fetchTaskBottlenecks(projectId)
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
