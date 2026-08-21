"use client"

import * as React from "react"

import { apiRequestError, isUnavailable } from "@/lib/api-error"
import type {
  CreateLocationRequest,
  Location,
  PatchLocationRequest,
  OrganizationDependencyBlocker,
} from "@/types/organization"

interface ApiError {
  error_code?: string
  message?: string
  blockers?: OrganizationDependencyBlocker[]
}

interface UseLocationsResult {
  locations: Location[]
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
  create: (body: CreateLocationRequest) => Promise<Location>
  patch: (id: string, body: PatchLocationRequest) => Promise<Location>
  remove: (id: string) => Promise<void>
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export function useLocations(): UseLocationsResult {
  const [locations, setLocations] = React.useState<Location[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/locations", { cache: "no-store" })
      if (!response.ok) throw await apiRequestError(response)
      const body = (await response.json()) as { locations: Location[] }
      setLocations(body?.locations ?? [])
      setUnavailable(false)
    } catch (err) {
      // Module gate, not a failure — see `unavailable` above.
      if (isUnavailable(err)) {
        setLocations([])
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

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

  const create = React.useCallback(
    async (body: CreateLocationRequest) => {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errBody = await readJson<ApiError>(response).catch((): ApiError => ({}))
        throw new Error(errBody?.message ?? `HTTP ${response.status}`)
      }
      const json = await readJson<{ location: Location }>(response)
      await refresh()
      return json.location
    },
    [refresh],
  )

  const patch = React.useCallback(
    async (id: string, body: PatchLocationRequest) => {
      const response = await fetch(`/api/locations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errBody = await readJson<ApiError>(response).catch((): ApiError => ({}))
        throw new Error(errBody?.message ?? `HTTP ${response.status}`)
      }
      const json = await readJson<{ location: Location }>(response)
      await refresh()
      return json.location
    },
    [refresh],
  )

  const remove = React.useCallback(
    async (id: string) => {
      const response = await fetch(`/api/locations/${id}`, { method: "DELETE" })
      if (!response.ok) {
        const errBody = await readJson<ApiError>(response).catch((): ApiError => ({}))
        const err = new Error(errBody?.message ?? `HTTP ${response.status}`)
        ;(err as Error & { code?: string; blockers?: unknown }).code =
          errBody?.error_code
        ;(err as Error & { code?: string; blockers?: unknown }).blockers =
          errBody?.blockers
        throw err
      }
      await refresh()
    },
    [refresh],
  )

  return {
    locations,
    loading,
    error,
    unavailable,
    refresh,
    create,
    patch,
    remove,
  }
}
