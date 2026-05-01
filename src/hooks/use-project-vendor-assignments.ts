"use client"

import * as React from "react"

import {
  type AssignmentInput,
  createAssignment,
  deleteAssignment,
  listProjectAssignments,
  updateAssignment,
} from "@/lib/vendors/api"
import type { VendorProjectAssignmentRich } from "@/types/vendor"

interface UseProjectVendorAssignmentsResult {
  assignments: VendorProjectAssignmentRich[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (input: AssignmentInput) => Promise<VendorProjectAssignmentRich>
  update: (
    id: string,
    input: Partial<AssignmentInput>
  ) => Promise<VendorProjectAssignmentRich>
  remove: (id: string) => Promise<void>
}

export function useProjectVendorAssignments(
  projectId: string
): UseProjectVendorAssignmentsResult {
  const [assignments, setAssignments] = React.useState<
    VendorProjectAssignmentRich[]
  >([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listProjectAssignments(projectId)
        if (cancelled) return
        setAssignments(list)
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
  }, [projectId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const add = React.useCallback(
    async (input: AssignmentInput) => {
      const created = await createAssignment(projectId, input)
      await refresh()
      return created
    },
    [projectId, refresh]
  )

  const update = React.useCallback(
    async (id: string, input: Partial<AssignmentInput>) => {
      const updated = await updateAssignment(projectId, id, input)
      await refresh()
      return updated
    },
    [projectId, refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteAssignment(projectId, id)
      await refresh()
    },
    [projectId, refresh]
  )

  return { assignments, loading, error, refresh, add, update, remove }
}
