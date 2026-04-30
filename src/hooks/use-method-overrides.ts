"use client"

import * as React from "react"

import { listMethodOverrides, setMethodEnabled } from "@/lib/master-data/api"
import type { MethodOverrideRow } from "@/types/master-data"
import type { ProjectMethod } from "@/types/project-method"

interface UseMethodOverridesResult {
  rows: MethodOverrideRow[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /**
   * Toggle a method's enabled state. Throws on 422 (min-1-method) so the
   * caller can revert the optimistic UI.
   */
  toggle: (methodKey: ProjectMethod, enabled: boolean) => Promise<void>
}

export function useMethodOverrides(): UseMethodOverridesResult {
  const [rows, setRows] = React.useState<MethodOverrideRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listMethodOverrides()
      setRows(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const toggle = React.useCallback(
    async (methodKey: ProjectMethod, enabled: boolean) => {
      await setMethodEnabled(methodKey, enabled)
      await refresh()
    },
    [refresh]
  )

  return { rows, loading, error, refresh, toggle }
}
