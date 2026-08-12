"use client"

import * as React from "react"

import { isUnavailable } from "@/lib/api-error"

import {
  createResource,
  deleteResource,
  listResources,
  type ResourceInput,
  type ResourceListOptions,
  type UpdateResourceOptions,
  updateResource,
} from "@/lib/resources/api"
import type { Resource } from "@/types/resource"

interface UseResourcesResult {
  resources: Resource[]
  loading: boolean
  error: string | null
  /**
   * PROJ-Y-143f — the `resources` module is not active for this workspace.
   *
   * Kept separate from `error` because it is not a failure: the list route's
   * only 404 path is `requireModuleActive` (read intent), which answers with
   * the deliberately generic "Resource not found." Rendering that verbatim
   * put a red technical error where the resource list belongs, and it had
   * been frozen into the PROJ-51 visual baseline as if it were the intended
   * UI.
   */
  unavailable: boolean
  refresh: () => Promise<void>
  create: (input: ResourceInput) => Promise<Resource>
  update: (
    id: string,
    input: Partial<ResourceInput>,
    options?: UpdateResourceOptions
  ) => Promise<Resource>
  remove: (id: string) => Promise<void>
}

export function useResources(
  options: ResourceListOptions = {}
): UseResourcesResult {
  const [resources, setResources] = React.useState<Resource[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)
  const [tick, setTick] = React.useState(0)

  // Capture options in a ref so the effect can read the latest values without
  // re-running on referential identity changes; the `active_only` / `kind`
  // primitives drive the dependency array.
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listResources(optionsRef.current)
        if (cancelled) return
        setResources(list)
        setError(null)
        setUnavailable(false)
      } catch (err) {
        if (cancelled) return
        // Module gate, not a failure — see `unavailable` above.
        if (isUnavailable(err)) {
          setResources([])
          setError(null)
          setUnavailable(true)
          return
        }
        setUnavailable(false)
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [options.active_only, options.kind, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const create = React.useCallback(
    async (input: ResourceInput) => {
      const created = await createResource(input)
      await refresh()
      return created
    },
    [refresh]
  )

  const update = React.useCallback(
    async (
      id: string,
      input: Partial<ResourceInput>,
      options?: UpdateResourceOptions
    ) => {
      const updated = await updateResource(id, input, options)
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

  return {
    resources,
    loading,
    error,
    unavailable,
    refresh,
    create,
    update,
    remove,
  }
}
