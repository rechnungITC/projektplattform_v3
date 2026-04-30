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

  const refresh = React.useCallback(async () => {
    if (!workItemId) {
      setDocuments([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const list = await listWorkItemDocuments(projectId, workItemId)
      setDocuments(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId, workItemId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { documents, loading, error, refresh }
}
