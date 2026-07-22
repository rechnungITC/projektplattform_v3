"use client"

import * as React from "react"

import { listStageGates } from "@/lib/ma-project/stage-gates-api"
import type { StageGate } from "@/lib/ma-project/stage-gates-api"

interface UseStageGatesResult {
  stageGates: StageGate[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/** PROJ-110 — lists a project's stage gates (RLS + need-to-know scoped server-side). */
export function useStageGates(
  projectId: string | null | undefined
): UseStageGatesResult {
  const [stageGates, setStageGates] = React.useState<StageGate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setStageGates([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setStageGates(await listStageGates(projectId))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Konnte Stage-Gates nicht laden."
      )
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setStageGates([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const rows = await listStageGates(projectId)
        if (!cancelled) setStageGates(rows)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Konnte Stage-Gates nicht laden."
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

  return { stageGates, loading, error, refresh: load }
}
