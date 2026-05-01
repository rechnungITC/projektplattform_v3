"use client"

import * as React from "react"

import {
  createEvaluation,
  deleteEvaluation,
  listEvaluations,
  type EvaluationInput,
} from "@/lib/vendors/api"
import type { VendorEvaluation } from "@/types/vendor"

interface UseVendorEvaluationsResult {
  evaluations: VendorEvaluation[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (input: EvaluationInput) => Promise<VendorEvaluation>
  remove: (id: string) => Promise<void>
}

export function useVendorEvaluations(
  vendorId: string | null
): UseVendorEvaluationsResult {
  const [evaluations, setEvaluations] = React.useState<VendorEvaluation[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(vendorId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!vendorId) {
        if (!cancelled) {
          setEvaluations([])
          setLoading(false)
        }
        return
      }
      try {
        const list = await listEvaluations(vendorId)
        if (cancelled) return
        setEvaluations(list)
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
  }, [vendorId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const add = React.useCallback(
    async (input: EvaluationInput) => {
      if (!vendorId) throw new Error("vendorId required")
      const created = await createEvaluation(vendorId, input)
      await refresh()
      return created
    },
    [vendorId, refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      if (!vendorId) return
      await deleteEvaluation(vendorId, id)
      await refresh()
    },
    [vendorId, refresh]
  )

  return { evaluations, loading, error, refresh, add, remove }
}
