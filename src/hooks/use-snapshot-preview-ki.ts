"use client"

import * as React from "react"

import type {
  PreviewKiRequest,
  PreviewKiResponse,
} from "@/lib/reports/types"

interface UseSnapshotPreviewKiResult {
  loading: boolean
  error: string | null
  preview: PreviewKiResponse | null
  generate: (body: PreviewKiRequest) => Promise<PreviewKiResponse | null>
  reset: () => void
}

/**
 * Triggers a KI-narrative preview for a Status-Report or Executive-
 * Summary snapshot before the user commits. Backend routes Class-3
 * inputs to the local provider only (PROJ-12 routing rules).
 *
 * Backend contract:
 *   POST /api/projects/[id]/snapshots/preview-ki → PreviewKiResponse
 */
export function useSnapshotPreviewKi(
  projectId: string,
): UseSnapshotPreviewKiResult {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<PreviewKiResponse | null>(null)

  const generate = React.useCallback(
    async (body: PreviewKiRequest) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/projects/${projectId}/snapshots/preview-ki`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        )
        if (!res.ok) {
          const message = await res.text()
          throw new Error(message || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as PreviewKiResponse
        setPreview(data)
        return data
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
        return null
      } finally {
        setLoading(false)
      }
    },
    [projectId],
  )

  const reset = React.useCallback(() => {
    setPreview(null)
    setError(null)
  }, [])

  return { loading, error, preview, generate, reset }
}
