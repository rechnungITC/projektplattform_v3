"use client"

import * as React from "react"

import { getProjectContext } from "@/lib/project-context/api"
import type { ProjectContextDocumentView } from "@/types/project-context"

export function useProjectContext(projectId: string): {
  data: ProjectContextDocumentView | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const [data, setData] = React.useState<ProjectContextDocumentView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const mounted = React.useRef(true)

  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getProjectContext(projectId)
      if (mounted.current) setData(result)
    } catch (caught) {
      if (mounted.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Projektkontext konnte nicht geladen werden.",
        )
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void getProjectContext(projectId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Projektkontext konnte nicht geladen werden.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { data, loading, error, refresh }
}
