"use client"

import * as React from "react"

import { apiRequestError, isUnavailable } from "@/lib/api-error"
import type {
  CreateOrganizationUnitRequest,
  MoveOrganizationUnitRequest,
  OrganizationDependencyBlocker,
  OrganizationUnit,
  PatchOrganizationUnitRequest,
} from "@/types/organization"

interface ApiError {
  error_code?: string
  message?: string
  blockers?: OrganizationDependencyBlocker[]
}

interface UseOrganizationUnitsResult {
  units: OrganizationUnit[]
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
  create: (body: CreateOrganizationUnitRequest) => Promise<OrganizationUnit>
  patch: (
    id: string,
    body: PatchOrganizationUnitRequest,
  ) => Promise<OrganizationUnit>
  move: (
    id: string,
    body: MoveOrganizationUnitRequest,
  ) => Promise<OrganizationUnit>
  remove: (id: string) => Promise<void>
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

export function useOrganizationUnits(): UseOrganizationUnitsResult {
  const [units, setUnits] = React.useState<OrganizationUnit[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/organization-units", {
        cache: "no-store",
      })
      if (!response.ok) throw await apiRequestError(response)
      const body = await readJson<{ units: OrganizationUnit[] }>(response)
      setUnits(body?.units ?? [])
      setUnavailable(false)
    } catch (err) {
      // Module gate, not a failure — see `unavailable` above.
      if (isUnavailable(err)) {
        setUnits([])
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
    async (body: CreateOrganizationUnitRequest) => {
      const response = await fetch("/api/organization-units", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errBody = await readJson<ApiError>(response).catch((): ApiError => ({}))
        throw new Error(errBody?.message ?? `HTTP ${response.status}`)
      }
      const json = await readJson<{ unit: OrganizationUnit }>(response)
      await refresh()
      return json.unit
    },
    [refresh],
  )

  const patch = React.useCallback(
    async (id: string, body: PatchOrganizationUnitRequest) => {
      const response = await fetch(`/api/organization-units/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errBody = await readJson<ApiError>(response).catch((): ApiError => ({}))
        throw new Error(errBody?.message ?? `HTTP ${response.status}`)
      }
      const json = await readJson<{ unit: OrganizationUnit }>(response)
      await refresh()
      return json.unit
    },
    [refresh],
  )

  const move = React.useCallback(
    async (id: string, body: MoveOrganizationUnitRequest) => {
      const response = await fetch(`/api/organization-units/${id}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const errBody = await readJson<ApiError>(response).catch((): ApiError => ({}))
        const err = new Error(errBody?.message ?? `HTTP ${response.status}`)
        ;(err as Error & { code?: string }).code = errBody?.error_code
        throw err
      }
      const json = await readJson<{ unit: OrganizationUnit }>(response)
      await refresh()
      return json.unit
    },
    [refresh],
  )

  const remove = React.useCallback(
    async (id: string) => {
      const response = await fetch(`/api/organization-units/${id}`, {
        method: "DELETE",
      })
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
    units,
    loading,
    error,
    unavailable,
    refresh,
    create,
    patch,
    move,
    remove,
  }
}