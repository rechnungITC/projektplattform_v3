"use client"

import * as React from "react"

import {
  createFxRate,
  deleteFxRate,
  listFxRates,
  type FxRateInput,
} from "@/lib/budget/api"
import type { FxRate } from "@/types/budget"

interface UseFxRatesResult {
  rates: FxRate[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: FxRateInput) => Promise<FxRate>
  remove: (id: string) => Promise<void>
}

export function useFxRates(tenantId: string): UseFxRatesResult {
  const [rates, setRates] = React.useState<FxRate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listFxRates(tenantId)
      setRates(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const create = React.useCallback(
    async (input: FxRateInput) => {
      const created = await createFxRate(tenantId, input)
      await refresh()
      return created
    },
    [tenantId, refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteFxRate(tenantId, id)
      await refresh()
    },
    [tenantId, refresh]
  )

  return { rates, loading, error, refresh, create, remove }
}
