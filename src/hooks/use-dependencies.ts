"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Dependency } from "@/types/dependency"

interface UseDependenciesResult {
  dependencies: Dependency[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Lists dependencies for a project.
 *
 * PROJ-9 backend pending — gracefully degrades to [] until tables exist.
 */
export function useDependencies(
  projectId: string | null | undefined
): UseDependenciesResult {
  const [dependencies, setDependencies] = React.useState<Dependency[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)

  const fetchOnce = React.useCallback(async () => {
    if (!projectId) {
      setDependencies([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from("dependencies")
        .select(
          "id, tenant_id, project_id, predecessor_id, successor_id, type, lag_days, created_by, created_at"
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })

      if (queryError) {
        setDependencies([])
        setError(null)
        return
      }

      setDependencies((data ?? []) as Dependency[])
    } catch {
      setDependencies([])
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void fetchOnce()
  }, [fetchOnce])

  return { dependencies, loading, error, refresh: fetchOnce }
}
