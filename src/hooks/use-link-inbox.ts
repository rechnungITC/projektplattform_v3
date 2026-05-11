"use client"

import * as React from "react"

import type { LinkInboxFilter, LinkInboxItem } from "@/types/work-item-link"

interface UseLinkInboxArgs {
  filter?: LinkInboxFilter
  search?: string
}

interface UseLinkInboxResult {
  items: LinkInboxItem[]
  loading: boolean
  error: string | null
  approve: (linkId: string) => Promise<void>
  reject: (linkId: string) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * PROJ-27 — feeds the project-lead approval inbox page.
 * `filter=pending` is the default; `approved` / `rejected` / `all`
 * for history. Optimistic actions are surfaced from the page (the
 * hook just mutates server-side and refreshes).
 */
export function useLinkInbox(
  projectId: string | null | undefined,
  { filter = "pending", search = "" }: UseLinkInboxArgs = {},
): UseLinkInboxResult {
  const [items, setItems] = React.useState<LinkInboxItem[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setItems([])
          setLoading(false)
          setError(null)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (filter) params.set("filter", filter)
        if (search) params.set("q", search)
        const qs = params.toString()
        const res = await fetch(
          `/api/projects/${projectId}/links/inbox${qs ? `?${qs}` : ""}`,
          { credentials: "same-origin" },
        )
        if (!res.ok) {
          if (res.status === 404 || res.status === 501) {
            if (!cancelled) {
              setItems([])
              setError(null)
            }
            return
          }
          if (res.status === 403) {
            if (!cancelled) {
              setItems([])
              setError("forbidden")
            }
            return
          }
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as { items: LinkInboxItem[] }
        if (!cancelled) setItems(json.items ?? [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
          setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, filter, search, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const approve = React.useCallback(
    async (linkId: string) => {
      if (!projectId) throw new Error("projectId required")
      const res = await fetch(
        `/api/projects/${projectId}/work-item-links/${linkId}/approve`,
        { method: "POST", credentials: "same-origin" },
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
    },
    [projectId],
  )

  const reject = React.useCallback(
    async (linkId: string) => {
      if (!projectId) throw new Error("projectId required")
      const res = await fetch(
        `/api/projects/${projectId}/work-item-links/${linkId}/reject`,
        { method: "POST", credentials: "same-origin" },
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
    },
    [projectId],
  )

  return { items, loading, error, approve, reject, refresh }
}
