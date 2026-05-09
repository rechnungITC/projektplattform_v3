"use client"

import * as React from "react"

import type { OrganizationUnitTreeNode } from "@/types/organization"

interface UseOrganizationTreeResult {
  tree: OrganizationUnitTreeNode[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useOrganizationTree(options?: {
  includeVendors?: boolean
}): UseOrganizationTreeResult {
  const includeVendors = options?.includeVendors ?? false
  const [tree, setTree] = React.useState<OrganizationUnitTreeNode[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (includeVendors) params.set("include_vendors", "true")
      const url = `/api/organization-units/tree${params.size ? `?${params}` : ""}`
      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const body = (await response.json()) as {
        tree: OrganizationUnitTreeNode[]
      }
      setTree(body?.tree ?? [])
    } catch (err) {
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

  return { tree, loading, error, refresh }
}