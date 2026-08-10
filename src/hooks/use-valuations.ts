"use client"

import * as React from "react"

import { listValuations } from "@/lib/ma-project/valuations-api"
import type { Valuation } from "@/types/valuation"

interface UseValuationsResult {
  valuations: Valuation[]
  /** Die gültige Version ("Aktuelle Bewertungssicht", AC4) — genau eine je Deal. */
  current: Valuation | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/** PROJ-120 — lädt die Bewertungs-Versionskette (RLS + Need-to-know serverseitig). */
export function useValuations(
  projectId: string | null | undefined
): UseValuationsResult {
  const [valuations, setValuations] = React.useState<Valuation[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setValuations([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setValuations(await listValuations(projectId))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Konnte Bewertungen nicht laden."
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
          setValuations([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const rows = await listValuations(projectId)
        if (!cancelled) setValuations(rows)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Konnte Bewertungen nicht laden."
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

  const current = React.useMemo(
    () => valuations.find((v) => v.is_current) ?? null,
    [valuations]
  )

  return { valuations, current, loading, error, refresh: load }
}
