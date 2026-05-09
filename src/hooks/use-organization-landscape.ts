"use client"

import * as React from "react"

import type { OrganizationLandscapeItem } from "@/types/organization"

interface UseOrganizationLandscapeResult {
  items: OrganizationLandscapeItem[]
  loading: boolean
  error: string | null
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

  const refresh = React.useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/organization-landscape", {
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const body = (await response.json()) as {
        items: OrganizationLandscapeItem[]
      }
      setItems(body?.items ?? [])
    } catch (err) {
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

  return { items, loading, error, refresh }
}
