"use client"

import * as React from "react"

import { apiRequestError, isUnavailable } from "@/lib/api-error"
import type { OrganizationUnitTreeNode } from "@/types/organization"

interface UseOrganizationTreeResult {
  tree: OrganizationUnitTreeNode[]
  loading: boolean
  error: string | null
  /**
   * PROJ-Y-143n — the `organization` module is not active for this workspace.
   *
   * Separate from `error` because it is not a failure (PROJ-Y-143f): this
   * route's only 404 path is `requireModuleActive` with read intent, whose
   * body is the deliberately generic "Resource not found.". Rendered as
   * `error` that reads as a defect, which is exactly the bug this slice
   * removes from the CSV-import page.
   */
  unavailable: boolean
  refresh: () => Promise<void>
}

export function useOrganizationTree(options?: {
  includeVendors?: boolean
}): UseOrganizationTreeResult {
  const includeVendors = options?.includeVendors ?? false
  const [tree, setTree] = React.useState<OrganizationUnitTreeNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (includeVendors) params.set("include_vendors", "true")
      const url = `/api/organization-units/tree${params.size ? `?${params}` : ""}`
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) throw await apiRequestError(response)
      const body = (await response.json()) as {
        tree: OrganizationUnitTreeNode[]
      }
      setTree(body?.tree ?? [])
      setUnavailable(false)
    } catch (err) {
      // Module gate, not a failure — see `unavailable` above.
      if (isUnavailable(err)) {
        setTree([])
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [includeVendors])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      await refresh()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  return { tree, loading, error, unavailable, refresh }
}