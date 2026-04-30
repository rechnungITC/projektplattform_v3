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

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const rows = await listProjectTypeOverrides()
      setList(rows)
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
