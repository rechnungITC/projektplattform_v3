"use client"

import * as React from "react"

import {
  fetchStakeholderRollup,
  type StakeholderRollupOptions,
} from "@/lib/master-data/api"
import type { StakeholderRollupRow } from "@/types/master-data"

interface UseStakeholderRollupResult {
  rows: StakeholderRollupRow[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useStakeholderRollup(
  options: StakeholderRollupOptions = {}
): UseStakeholderRollupResult {
  const [rows, setRows] = React.useState<StakeholderRollupRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await fetchStakeholderRollup(options)
      setRows(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [options.active_only, options.role, options.org_unit, options.search])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { rows, loading, error, refresh }
}
