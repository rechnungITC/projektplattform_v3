"use client"

import * as React from "react"

import {
  deleteProjectTypeOverride,
  listProjectTypeOverrides,
  saveProjectTypeOverride,
} from "@/lib/master-data/api"
import type {
  ProjectTypeOverrideFields,
  ProjectTypeOverrideRow,
} from "@/types/master-data"
import type { ProjectType } from "@/types/project"

interface UseProjectTypeOverridesResult {
  overrides: Map<ProjectType, ProjectTypeOverrideRow>
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  save: (
    typeKey: ProjectType,
    overrides: ProjectTypeOverrideFields
  ) => Promise<ProjectTypeOverrideRow>
  remove: (typeKey: ProjectType) => Promise<void>
}

export function useProjectTypeOverrides(): UseProjectTypeOverridesResult {
  const [list, setList] = React.useState<ProjectTypeOverrideRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await listProjectTypeOverrides()
        if (cancelled) return
        setList(rows)
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
  }, [tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const overrides = React.useMemo(() => {
    const m = new Map<ProjectType, ProjectTypeOverrideRow>()
    for (const r of list) m.set(r.type_key, r)
    return m
  }, [list])

  const save = React.useCallback(
    async (typeKey: ProjectType, payload: ProjectTypeOverrideFields) => {
      const updated = await saveProjectTypeOverride(typeKey, payload)
      await refresh()
      return updated
    },
    [refresh]
  )

  const remove = React.useCallback(
    async (typeKey: ProjectType) => {
      await deleteProjectTypeOverride(typeKey)
      await refresh()
    },
    [refresh]
  )

  return { overrides, loading, error, refresh, save, remove }
}
