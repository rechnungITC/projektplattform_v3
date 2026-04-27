"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Sprint, SprintState } from "@/types/sprint"

interface UseSprintsOptions {
  state?: SprintState
}

interface UseSprintsResult {
  sprints: Sprint[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type RawRow = Sprint

/**
 * Lists sprints for a project, ordered by `start_date DESC NULLS LAST,
 * created_at DESC` so active and recent sprints surface first.
 *
 * PROJ-9 backend pending — gracefully degrades to [] until tables exist.
 */
export function useSprints(
  projectId: string | null | undefined,
  options: UseSprintsOptions = {}
): UseSprintsResult {
  const [sprints, setSprints] = React.useState<Sprint[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)

  const fetchOnce = React.useCallback(async () => {
    if (!projectId) {
      setSprints([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      let query = supabase
        .from("sprints")
        .select(
          "id, tenant_id, project_id, name, goal, start_date, end_date, state, created_by, created_at, updated_at"
        )
        .eq("project_id", projectId)
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })

      if (options.state) {
        query = query.eq("state", options.state)
      }

      const { data, error: queryError } = await query

      if (queryError) {
        setSprints([])
        setError(null)
        return
      }

      setSprints((data ?? []) as RawRow[])
    } catch {
      setSprints([])
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, options.state])

  React.useEffect(() => {
    void fetchOnce()
  }, [fetchOnce])

  return { sprints, loading, error, refresh: fetchOnce }
}
