"use client"

import * as React from "react"

import type {
  ProjectRelease,
  ProjectReleaseSummaryResponse,
  ReleaseAssignableWorkItem,
  ReleaseWritePayload,
} from "@/types/release"
import type { WorkItemKind } from "@/types/work-item"

interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    field?: string
  }
}

interface UseProjectReleasesResult {
  releases: ProjectRelease[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createRelease: (payload: ReleaseWritePayload) => Promise<ProjectRelease>
}

interface UseReleaseSummaryResult {
  data: ProjectReleaseSummaryResponse | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

interface UseReleaseAssignableItemsResult {
  items: ReleaseAssignableWorkItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  assignRelease: (
    workItemId: string,
    releaseId: string | null
  ) => Promise<ReleaseAssignableWorkItem>
}

const RELEASE_ITEM_KINDS: readonly WorkItemKind[] = ["story", "task", "bug"]

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as ApiErrorBody
  if (!res.ok) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`)
  }
  return body as T
}

export function useProjectReleases(
  projectId: string | null | undefined
): UseProjectReleasesResult {
  const [releases, setReleases] = React.useState<ProjectRelease[]>([])
  const [loading, setLoading] = React.useState(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setReleases([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const data = await readJson<{ releases: ProjectRelease[] }>(
          await fetch(`/api/projects/${projectId}/releases`, {
            cache: "no-store",
          })
        )
        if (!cancelled) setReleases(data.releases ?? [])
      } catch (caught) {
        if (!cancelled) {
          setReleases([])
          setError(
            caught instanceof Error
              ? caught.message
              : "Releases konnten nicht geladen werden."
          )
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
    setTick((value) => value + 1)
  }, [])

  const createRelease = React.useCallback(
    async (payload: ReleaseWritePayload) => {
      if (!projectId) throw new Error("Project id missing.")
      const data = await readJson<{ release: ProjectRelease }>(
        await fetch(`/api/projects/${projectId}/releases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      )
      await refresh()
      return data.release
    },
    [projectId, refresh]
  )

  return { releases, loading, error, refresh, createRelease }
}

export function useReleaseSummary(
  projectId: string | null | undefined,
  releaseId: string | null | undefined
): UseReleaseSummaryResult {
  const [data, setData] = React.useState<ProjectReleaseSummaryResponse | null>(
    null
  )
  const [loading, setLoading] = React.useState(Boolean(projectId && releaseId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId || !releaseId) {
        if (!cancelled) {
          setData(null)
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const body = await readJson<ProjectReleaseSummaryResponse>(
          await fetch(
            `/api/projects/${projectId}/releases/${releaseId}/summary`,
            { cache: "no-store" }
          )
        )
        if (!cancelled) setData(body)
      } catch (caught) {
        if (!cancelled) {
          setData(null)
          setError(
            caught instanceof Error
              ? caught.message
              : "Release-Summary konnte nicht geladen werden."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, releaseId, tick])

  const refresh = React.useCallback(async () => {
    setTick((value) => value + 1)
  }, [])

  return { data, loading, error, refresh }
}

export function useReleaseAssignableItems(
  projectId: string | null | undefined
): UseReleaseAssignableItemsResult {
  const [items, setItems] = React.useState<ReleaseAssignableWorkItem[]>([])
  const [loading, setLoading] = React.useState(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setItems([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const batches = await Promise.all(
          RELEASE_ITEM_KINDS.map(async (kind) => {
            const data = await readJson<{
              work_items: ReleaseAssignableWorkItem[]
            }>(
              await fetch(
                `/api/projects/${projectId}/work-items?kind=${kind}`,
                { cache: "no-store" }
              )
            )
            return data.work_items ?? []
          })
        )
        if (!cancelled) setItems(batches.flat())
      } catch (caught) {
        if (!cancelled) {
          setItems([])
          setError(
            caught instanceof Error
              ? caught.message
              : "Work Items konnten nicht geladen werden."
          )
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
    setTick((value) => value + 1)
  }, [])

  const assignRelease = React.useCallback(
    async (workItemId: string, releaseId: string | null) => {
      if (!projectId) throw new Error("Project id missing.")
      const data = await readJson<{ work_item: ReleaseAssignableWorkItem }>(
        await fetch(
          `/api/projects/${projectId}/work-items/${workItemId}/release`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ release_id: releaseId }),
          }
        )
      )
      await refresh()
      return data.work_item
    },
    [projectId, refresh]
  )

  return { items, loading, error, refresh, assignRelease }
}
