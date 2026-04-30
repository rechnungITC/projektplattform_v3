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

  const refresh = React.useCallback(async () => {
    if (!phaseId) {
      setWarnings([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const list = await listPhaseComplianceWarnings(projectId, phaseId)
      setWarnings(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId, phaseId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { warnings, loading, error, refresh }
}
