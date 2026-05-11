"use client"

import * as React from "react"

import type { WorkItemSearchResultItem } from "@/types/work-item-link"

interface UseWorkItemSearchArgs {
  /** When true, searches across all projects the caller can access. */
  tenantScope?: boolean
  /** Exclude this work-item from the result list (used to suppress self-links). */
  excludeWorkItemId?: string | null
  /** Cap; backend should also cap at 25. */
  limit?: number
}

interface UseWorkItemSearchResult {
  query: string
  setQuery: (value: string) => void
  results: WorkItemSearchResultItem[]
  loading: boolean
  error: string | null
}

const DEBOUNCE_MS = 250

/**
 * PROJ-27 — debounced combobox query against the cross-project
 * work-item search endpoint. Tenant-scoped by default so users can
 * pick any item they have access to.
 */
export function useWorkItemSearch({
  tenantScope = true,
  excludeWorkItemId = null,
  limit = 25,
}: UseWorkItemSearchArgs = {}): UseWorkItemSearchResult {
  const [query, setQuery] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [results, setResults] = React.useState<WorkItemSearchResultItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  React.useEffect(() => {
    if (debounced.length < 2) {
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        setResults([])
        setLoading(false)
        setError(null)
      })
      return () => {
        cancelled = true
      }
    }
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })
    void (async () => {
      try {
        const params = new URLSearchParams()
        params.set("q", debounced)
        if (tenantScope) params.set("tenant_scope", "true")
        params.set("limit", String(limit))
        const res = await fetch(`/api/work-items/search?${params.toString()}`, {
          credentials: "same-origin",
        })
        if (!res.ok) {
          if (res.status === 404 || res.status === 501) {
            if (!cancelled) setResults([])
            return
          }
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }
        const json = (await res.json()) as { items: WorkItemSearchResultItem[] }
        if (!cancelled) {
          const filtered = excludeWorkItemId
            ? (json.items ?? []).filter((it) => it.id !== excludeWorkItemId)
            : json.items ?? []
          setResults(filtered)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
          setResults([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debounced, tenantScope, excludeWorkItemId, limit])

  return { query, setQuery, results, loading, error }
}
