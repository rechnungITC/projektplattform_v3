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

  const refresh = React.useCallback(async () => {
    if (!vendorId) {
      setEvaluations([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const list = await listEvaluations(vendorId)
      setEvaluations(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [vendorId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

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
