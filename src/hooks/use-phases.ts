"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Phase, PhaseStatus } from "@/types/phase"

interface UsePhasesResult {
  phases: Phase[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type RawPhaseRow = {
  id: string
  tenant_id: string
  project_id: string
  name: string
  description: string | null
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  sequence_number: number
  status: PhaseStatus
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
}

/**
 * Fetches phases for a project, ordered by `sequence_number` ascending.
 *
 * PROJ-19 backend pending — gracefully degrades to [] until tables exist.
 */
export function usePhases(
  projectId: string | null | undefined
): UsePhasesResult {
  const [phases, setPhases] = React.useState<Phase[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)

  const fetchOnce = React.useCallback(async () => {
    if (!projectId) {
      setPhases([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from("phases")
        .select(
          "id, tenant_id, project_id, name, description, planned_start, planned_end, actual_start, actual_end, sequence_number, status, created_by, created_at, updated_at, is_deleted"
        )
        .eq("project_id", projectId)
        .eq("is_deleted", false)
        .order("sequence_number", { ascending: true })

      if (queryError) {
        // Most likely cause right now: the table doesn't exist yet (PROJ-19
        // backend pending). Don't surface this as a hard error.
        setPhases([])
        setError(null)
        return
      }

      setPhases((data ?? []) as RawPhaseRow[])
    } catch {
      // Same swallow-the-missing-table pattern as use-project-role.ts.
      setPhases([])
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void fetchOnce()
  }, [fetchOnce])

  return { phases, loading, error, refresh: fetchOnce }
}
