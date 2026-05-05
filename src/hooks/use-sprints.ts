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
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setSprints([])
          setLoading(false)
        }
        return
      }
      try {
        const supabase = createClient()
        let query = supabase
          .from("sprints")
          .select(
            "id, tenant_id, project_id, name, goal, start_date, end_date, state, is_critical, created_by, created_at, updated_at"
          )
          .eq("project_id", projectId)
          .order("start_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })

        if (options.state) {
          query = query.eq("state", options.state)
        }

        const { data, error: queryError } = await query
        if (cancelled) return
        if (queryError) {
          setSprints([])
          setError(null)
          return
        }
        setSprints((data ?? []) as RawRow[])
      } catch {
        if (!cancelled) {
          setSprints([])
          setError(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, options.state, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { sprints, loading, error, refresh }
}
