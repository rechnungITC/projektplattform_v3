"use client"

import * as React from "react"

import {
  createRoleRate,
  deleteRoleRate,
  listRoleRates,
} from "@/lib/role-rates/api"
import type { RoleRate, RoleRateInput } from "@/types/role-rate"

interface UseRoleRatesResult {
  rates: RoleRate[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: RoleRateInput) => Promise<RoleRate>
  remove: (id: string) => Promise<void>
}

export function useRoleRates(tenantId: string): UseRoleRatesResult {
  const [rates, setRates] = React.useState<RoleRate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listRoleRates(tenantId)
        if (cancelled) return
        setRates(list)
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
  }, [tenantId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const create = React.useCallback(
    async (input: RoleRateInput) => {
      const created = await createRoleRate(tenantId, input)
      await refresh()
      return created
    },
    [tenantId, refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteRoleRate(tenantId, id)
      await refresh()
    },
    [tenantId, refresh]
  )

  return { rates, loading, error, refresh, create, remove }
}
