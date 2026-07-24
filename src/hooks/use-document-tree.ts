"use client"

import * as React from "react"

import { fetchDocumentTree } from "@/lib/dms/api"
import { buildForest } from "@/lib/dms/tree"
import type { TreeForestNode } from "@/types/dms"

interface UseDocumentTreeResult {
  forest: TreeForestNode[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * PROJ-79-α — loads a project's whole document tree (`?all=true`) and builds
 * the react-arborist forest. RLS + project membership scope it server-side.
 */
export function useDocumentTree(
  projectId: string | null | undefined,
): UseDocumentTreeResult {
  const [forest, setForest] = React.useState<TreeForestNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setForest([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const nodes = await fetchDocumentTree(projectId)
      setForest(buildForest(nodes))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Konnte Dokumente nicht laden.",
      )
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setForest([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const nodes = await fetchDocumentTree(projectId)
        if (!cancelled) setForest(buildForest(nodes))
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Konnte Dokumente nicht laden.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { forest, loading, error, refresh: load }
}
