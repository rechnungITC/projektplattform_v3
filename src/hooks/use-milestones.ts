"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import {
  isOverdue,
  type Milestone,
  type MilestoneStatus,
} from "@/types/milestone"

interface UseMilestonesOptions {
  /** Filter by phase. `null` filters to "no phase". `undefined` = no filter. */
  phaseId?: string | null
  /** Filter by status. `undefined` = no filter. */
  status?: MilestoneStatus
  /** Show only overdue (computed `is_overdue=true`). */
  overdueOnly?: boolean
}

interface UseMilestonesResult {
  milestones: Milestone[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type RawMilestoneRow = {
  id: string
  tenant_id: string
  project_id: string
  phase_id: string | null
  name: string
  description: string | null
  target_date: string
  actual_date: string | null
  status: MilestoneStatus
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
}

/**
 * Fetches milestones for a project, ordered by `target_date` ascending.
 *
 * PROJ-19 backend pending — gracefully degrades to [] until tables exist.
 *
 * Filtering is applied client-side after the fetch so callers can change
 * filters without re-querying. The hook intentionally re-runs only when
 * `projectId` changes; filter changes are cheap memo work.
 */
export function useMilestones(
  projectId: string | null | undefined,
  options: UseMilestonesOptions = {}
): UseMilestonesResult {
  const [milestones, setMilestones] = React.useState<Milestone[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setMilestones([])
          setLoading(false)
        }
        return
      }
      try {
        const supabase = createClient()
        const { data, error: queryError } = await supabase
          .from("milestones")
          .select(
            "id, tenant_id, project_id, phase_id, name, description, target_date, actual_date, status, created_by, created_at, updated_at, is_deleted"
          )
          .eq("project_id", projectId)
          .eq("is_deleted", false)
          .order("target_date", { ascending: true })

        if (cancelled) return
        if (queryError) {
          // PROJ-19 backend pending — gracefully degrades to [] until tables
          // exist.
          setMilestones([])
          setError(null)
          return
        }
        setMilestones((data ?? []) as RawMilestoneRow[])
      } catch {
        if (!cancelled) {
          setMilestones([])
          setError(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const filtered = React.useMemo(() => {
    let result = milestones
    if (options.phaseId !== undefined) {
      result = result.filter((m) => m.phase_id === options.phaseId)
    }
    if (options.status !== undefined) {
      const statusFilter = options.status
      result = result.filter((m) => m.status === statusFilter)
    }
    if (options.overdueOnly) {
      result = result.filter((m) => isOverdue(m))
    }
    return result
  }, [milestones, options.phaseId, options.status, options.overdueOnly])

  return { milestones: filtered, loading, error, refresh }
}
