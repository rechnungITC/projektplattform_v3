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
  const [tick, setTick] = React.useState(0)

  // See note in use-resources.ts — primitives drive the dep array; the ref
  // mirrors the latest object so callers don't have to memoize the wrapper.
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await fetchStakeholderRollup(optionsRef.current)
        if (cancelled) return
        setRows(list)
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
  }, [
    options.active_only,
    options.role,
    options.org_unit,
    options.search,
    tick,
  ])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { rows, loading, error, refresh }
}
