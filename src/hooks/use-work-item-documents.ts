"use client"

import * as React from "react"

import { listWorkItemDocuments } from "@/lib/compliance/api"
import type { WorkItemDocument } from "@/lib/compliance/types"

interface UseWorkItemDocumentsResult {
  documents: WorkItemDocument[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useWorkItemDocuments(
  projectId: string,
  workItemId: string | null
): UseWorkItemDocumentsResult {
  const [documents, setDocuments] = React.useState<WorkItemDocument[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!workItemId) {
        if (!cancelled) {
          setDocuments([])
          setLoading(false)
        }
        return
      }
      try {
        const list = await listWorkItemDocuments(projectId, workItemId)
        if (cancelled) return
        setDocuments(list)
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

  return { documents, loading, error, refresh }
}
