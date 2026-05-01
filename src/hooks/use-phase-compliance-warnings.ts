"use client"

import * as React from "react"

import { listPhaseComplianceWarnings } from "@/lib/compliance/api"
import type { ComplianceWarning } from "@/lib/compliance/types"

interface UsePhaseComplianceWarningsResult {
  warnings: ComplianceWarning[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function usePhaseComplianceWarnings(
  projectId: string,
  phaseId: string | null
): UsePhaseComplianceWarningsResult {
  const [warnings, setWarnings] = React.useState<ComplianceWarning[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!phaseId) {
        if (!cancelled) {
          setWarnings([])
          setLoading(false)
        }
        return
      }
      try {
        const list = await listPhaseComplianceWarnings(projectId, phaseId)
        if (cancelled) return
        setWarnings(list)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, phaseId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { warnings, loading, error, refresh }
}
