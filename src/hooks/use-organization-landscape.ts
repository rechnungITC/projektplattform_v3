"use client"

import * as React from "react"

import { apiRequestError, isUnavailable } from "@/lib/api-error"
import type { OrganizationLandscapeItem } from "@/types/organization"

interface UseOrganizationLandscapeResult {
  items: OrganizationLandscapeItem[]
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

/**
 * PROJ-62 — read-only "Vendors einblenden" view, joining
 * `organization_units` with PROJ-15 `vendors` through the
 * `tenant_organization_landscape` view. Live-fetched and cached
 * client-side for the tree-view toggle.
 */
export function useOrganizationLandscape(
  enabled: boolean,
): UseOrganizationLandscapeResult {
  const [items, setItems] = React.useState<OrganizationLandscapeItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/organization-landscape", {
        cache: "no-store",
      })
      if (!response.ok) throw await apiRequestError(response)
      const body = (await response.json()) as {
        items: OrganizationLandscapeItem[]
      }
      setItems(body?.items ?? [])
      setUnavailable(false)
    } catch (err) {
      // Module gate, not a failure — see `unavailable` above.
      if (isUnavailable(err)) {
        setItems([])
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [enabled])

  React.useEffect(() => {
    let cancelled = false
    if (!enabled) {
      setItems([])
      setError(null)
      setUnavailable(false)
      setLoading(false)
      return
    }
    void (async () => {
      await refresh()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, refresh])

  return { items, loading, error, unavailable, refresh }
}
