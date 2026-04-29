"use client"

import * as React from "react"

import {
  createResource,
  deleteResource,
  listResources,
  type ResourceInput,
  type ResourceListOptions,
  updateResource,
} from "@/lib/resources/api"
import type { Resource } from "@/types/resource"

interface UseResourcesResult {
  resources: Resource[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  create: (input: ResourceInput) => Promise<Resource>
  update: (id: string, input: Partial<ResourceInput>) => Promise<Resource>
  remove: (id: string) => Promise<void>
}

export function useResources(
  options: ResourceListOptions = {}
): UseResourcesResult {
  const [resources, setResources] = React.useState<Resource[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listResources(options)
      setResources(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [options.active_only, options.kind])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const create = React.useCallback(
    async (input: ResourceInput) => {
      const created = await createResource(input)
      await refresh()
      return created
    },
    [refresh]
  )

  const update = React.useCallback(
    async (id: string, input: Partial<ResourceInput>) => {
      const updated = await updateResource(id, input)
      await refresh()
      return updated
    },
    [refresh]
  )

  const remove = React.useCallback(
    async (id: string) => {
      await deleteResource(id)
      await refresh()
    },
    [refresh]
  )

  return { resources, loading, error, refresh, create, update, remove }
}
