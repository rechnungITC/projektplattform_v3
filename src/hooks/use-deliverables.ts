"use client"

import * as React from "react"

import { listDeliverables } from "@/lib/ma-project/deliverables-api"
import type { Deliverable } from "@/types/deliverable"

interface UseDeliverablesResult {
  deliverables: Deliverable[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/** PROJ-104 — lists a project's deliverables (RLS + need-to-know scoped server-side). */
export function useDeliverables(
  projectId: string | null | undefined
): UseDeliverablesResult {
  const [deliverables, setDeliverables] = React.useState<Deliverable[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setDeliverables([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setDeliverables(await listDeliverables(projectId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte Deliverables nicht laden.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setDeliverables([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const rows = await listDeliverables(projectId)
        if (!cancelled) setDeliverables(rows)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Konnte Deliverables nicht laden.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { deliverables, loading, error, refresh: load }
}
