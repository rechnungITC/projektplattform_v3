"use client"

import * as React from "react"

import type {
  CreateLinkRequest,
  CreateLinkResponse,
  WorkItemLinkWithTargets,
  WorkItemLinksGroupedResponse,
} from "@/types/work-item-link"

interface UseWorkItemLinksResult {
  outgoing: WorkItemLinkWithTargets[]
  incoming: WorkItemLinkWithTargets[]
  pendingApproval: WorkItemLinkWithTargets[]
  loading: boolean
  error: string | null
  create: (req: CreateLinkRequest) => Promise<CreateLinkResponse>
  remove: (linkId: string) => Promise<void>
  approve: (linkId: string) => Promise<void>
  reject: (linkId: string) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * PROJ-27 — fetches work-item-perspective link buckets via the
 * backend-shaped endpoint. Returns `outgoing` / `incoming` /
 * `pending_approval` per Designer Brief § 3. Mutators (create,
 * remove, approve, reject) all trigger a refresh on success.
 */
export function useWorkItemLinks(
  projectId: string | null | undefined,
  workItemId: string | null | undefined,
): UseWorkItemLinksResult {
  const [data, setData] = React.useState<WorkItemLinksGroupedResponse>({
    outgoing: [],
    incoming: [],
    pending_approval: [],
  })
  const [loading, setLoading] = React.useState<boolean>(
    Boolean(projectId && workItemId),
  )
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId || !workItemId) {
        if (!cancelled) {
          setData({ outgoing: [], incoming: [], pending_approval: [] })
          setLoading(false)
          setError(null)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/projects/${projectId}/work-items/${workItemId}/links`,
          { credentials: "same-origin" },
        )
        if (!res.ok) {
          // 404 + 501 are tolerated as "no links yet / endpoint pending".
          if (res.status === 404 || res.status === 501) {
            if (!cancelled) {
              setData({ outgoing: [], incoming: [], pending_approval: [] })
              setError(null)
            }
            return
          }
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as WorkItemLinksGroupedResponse
        if (!cancelled) {
          setData({
            outgoing: json.outgoing ?? [],
            incoming: json.incoming ?? [],
            pending_approval: json.pending_approval ?? [],
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
          setData({ outgoing: [], incoming: [], pending_approval: [] })
        }
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

  const create = React.useCallback(
    async (req: CreateLinkRequest): Promise<CreateLinkResponse> => {
      if (!projectId) throw new Error("projectId required")
      const res = await fetch(`/api/projects/${projectId}/work-item-links`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const out = (await res.json()) as CreateLinkResponse
      await refresh()
      return out
    },
    [projectId, refresh],
  )

  const remove = React.useCallback(
    async (linkId: string): Promise<void> => {
      if (!projectId) throw new Error("projectId required")
      const res = await fetch(
        `/api/projects/${projectId}/work-item-links/${linkId}`,
        { method: "DELETE", credentials: "same-origin" },
      )
      if (!res.ok && res.status !== 204) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      await refresh()
    },
    [projectId, refresh],
  )

  const approve = React.useCallback(
    async (linkId: string): Promise<void> => {
      if (!projectId) throw new Error("projectId required")
      const res = await fetch(
        `/api/projects/${projectId}/work-item-links/${linkId}/approve`,
        { method: "POST", credentials: "same-origin" },
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      await refresh()
    },
    [projectId, refresh],
  )

  const reject = React.useCallback(
    async (linkId: string): Promise<void> => {
      if (!projectId) throw new Error("projectId required")
      const res = await fetch(
        `/api/projects/${projectId}/work-item-links/${linkId}/reject`,
        { method: "POST", credentials: "same-origin" },
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      await refresh()
    },
    [projectId, refresh],
  )

  return {
    outgoing: data.outgoing,
    incoming: data.incoming,
    pendingApproval: data.pending_approval,
    loading,
    error,
    create,
    remove,
    approve,
    reject,
    refresh,
  }
}
