"use client"

import * as React from "react"

import type {
  CreateSnapshotRequest,
  ReportSnapshot,
  SnapshotListItem,
} from "@/lib/reports/types"

interface UseSnapshotsResult {
  snapshots: SnapshotListItem[]
  loading: boolean
  error: string | null
  create: (
    body: CreateSnapshotRequest,
  ) => Promise<{ snapshot: ReportSnapshot; snapshotUrl: string } | null>
  retryPdf: (snapshotId: string) => Promise<void>
  refresh: (options?: { silent?: boolean }) => Promise<void>
}

const PENDING_POLL_MS = 5_000

/**
 * Fetches the snapshot list for a project and exposes a `create`
 * callback for the "Snapshot erzeugen" buttons. Backend contract:
 *
 *   GET  /api/projects/[id]/snapshots         → { snapshots: SnapshotListItem[] }
 *   POST /api/projects/[id]/snapshots         → { snapshot, snapshotUrl }
 *   POST /api/projects/[id]/snapshots/[sid]/render-pdf → 204
 */
export function useSnapshots(projectId: string): UseSnapshotsResult {
  const [snapshots, setSnapshots] = React.useState<SnapshotListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        cache: "no-store",
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = (await res.json()) as { snapshots: SnapshotListItem[] }
      setSnapshots(data.snapshots ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      if (!silent) setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!snapshots.some((snapshot) => snapshot.pdf_status === "pending")) {
      return
    }
    const interval = window.setInterval(() => {
      void refresh({ silent: true })
    }, PENDING_POLL_MS)
    return () => window.clearInterval(interval)
  }, [refresh, snapshots])

  const create = React.useCallback(
    async (body: CreateSnapshotRequest) => {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const message = await res.text()
        throw new Error(message || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as {
        snapshot: ReportSnapshot
        snapshotUrl: string
      }
      await refresh()
      return data
    },
    [projectId, refresh],
  )

  const retryPdf = React.useCallback(
    async (snapshotId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/snapshots/${snapshotId}/render-pdf`,
        { method: "POST" },
      )
      if (!res.ok) {
        const message = await res.text()
        throw new Error(message || `HTTP ${res.status}`)
      }
      await refresh()
    },
    [projectId, refresh],
  )

  return { snapshots, loading, error, create, retryPdf, refresh }
}
