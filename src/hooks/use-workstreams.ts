"use client"

import * as React from "react"

import { listWorkstreams } from "@/lib/ma-project/workstreams-api"
import type { Workstream } from "@/types/workstream"

interface UseWorkstreamsResult {
  workstreams: Workstream[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * PROJ-102 — lists a project's workstreams (RLS + need-to-know scoped server-side).
 */
export function useWorkstreams(
  projectId: string | null | undefined
): UseWorkstreamsResult {
  const [workstreams, setWorkstreams] = React.useState<Workstream[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setWorkstreams([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await listWorkstreams(projectId)
      setWorkstreams(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte Workstreams nicht laden.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setWorkstreams([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const rows = await listWorkstreams(projectId)
        if (!cancelled) setWorkstreams(rows)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Konnte Workstreams nicht laden."
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

  return { workstreams, loading, error, refresh: load }
}
