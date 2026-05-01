"use client"

import * as React from "react"

import {
  attachTagToWorkItem,
  detachTagFromWorkItem,
  listWorkItemTags,
} from "@/lib/compliance/api"
import type { ComplianceTag, WorkItemTagRow } from "@/lib/compliance/types"

interface AttachResult {
  childWorkItemIds: string[]
  documentIds: string[]
}

interface UseWorkItemTagsResult {
  rows: { link: WorkItemTagRow; tag: ComplianceTag }[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  attach: (tagId: string) => Promise<AttachResult>
  detach: (linkId: string) => Promise<void>
}

export function useWorkItemTags(
  projectId: string,
  workItemId: string | null
): UseWorkItemTagsResult {
  const [rows, setRows] = React.useState<
    { link: WorkItemTagRow; tag: ComplianceTag }[]
  >([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!workItemId) {
        if (!cancelled) {
          setRows([])
          setLoading(false)
        }
        return
      }
      try {
        const list = await listWorkItemTags(projectId, workItemId)
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
  }, [projectId, workItemId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const attach = React.useCallback(
    async (tagId: string): Promise<AttachResult> => {
      if (!workItemId) throw new Error("No work item selected.")
      const result = await attachTagToWorkItem(projectId, workItemId, tagId)
      await refresh()
      return {
        childWorkItemIds: result.childWorkItemIds,
        documentIds: result.documentIds,
      }
    },
    [projectId, workItemId, refresh]
  )

  const detach = React.useCallback(
    async (linkId: string) => {
      if (!workItemId) throw new Error("No work item selected.")
      await detachTagFromWorkItem(projectId, workItemId, linkId)
      await refresh()
    },
    [projectId, workItemId, refresh]
  )

  return { rows, loading, error, refresh, attach, detach }
}
