"use client"

import * as React from "react"

import { apiRequestError, isUnavailable } from "@/lib/api-error"
import type {
  OrganizationImport,
  OrganizationImportDedupStrategy,
} from "@/types/organization-import"

interface UploadResult {
  import_id: string
  row_count_total: number
  row_count_errored: number
  preview_url: string
}

interface CommitResult {
  import_id: string
  row_count_imported: number
  row_count_skipped: number
  errors: string[]
}

interface RollbackResult {
  import_id: string
  row_count_rolled_back: number
}

interface UseOrganizationImportsResult {
  imports: OrganizationImport[]
  loading: boolean
  error: string | null
  /**
   * PROJ-Y-143n — the `organization` module is not active for this workspace.
   *
   * This is the defect the slice was opened for: the CSV-import routes were
   * the *only* organization routes that ever called `requireModuleActive`, so
   * in every workspace with the switch off this page already answered 404 —
   * and the hook turned that into `error`, painting a red fault box over a
   * workspace setting. The gate is correct (PROJ-Y-143f); rendering it as a
   * failure was not.
   */
  unavailable: boolean
  refresh: () => Promise<void>
  upload: (formData: FormData) => Promise<UploadResult>
  preview: (id: string) => Promise<OrganizationImport>
  commit: (
    id: string,
    dedupStrategy?: OrganizationImportDedupStrategy,
  ) => Promise<CommitResult>
  rollback: (id: string) => Promise<RollbackResult>
}

interface ApiError {
  error?: {
    code: string
    message: string
    field?: string
  }
}

export function useOrganizationImports(): UseOrganizationImportsResult {
  const [imports, setImports] = React.useState<OrganizationImport[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/organization-imports", {
        cache: "no-store",
      })
      if (!response.ok) throw await apiRequestError(response)
      const body = (await response.json()) as { imports: OrganizationImport[] }
      setImports(body.imports ?? [])
      setUnavailable(false)
    } catch (err) {
      // Module gate, not a failure — see `unavailable` above. The list route
      // has exactly one 404 path (`requireModuleActive`, read intent), so the
      // reason can be named honestly at the call site.
      if (isUnavailable(err)) {
        setImports([])
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
      if (!cancelled) await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const upload = React.useCallback(async (formData: FormData) => {
    const response = await fetch("/api/organization-imports/upload", {
      method: "POST",
      body: formData,
    })
    if (!response.ok) throw await toError(response)
    return (await response.json()) as UploadResult
  }, [])

  const preview = React.useCallback(async (id: string) => {
    const response = await fetch(`/api/organization-imports/${id}/preview`, {
      cache: "no-store",
    })
    if (!response.ok) throw await toError(response)
    const body = (await response.json()) as { import: OrganizationImport }
    return body.import
  }, [])

  const commit = React.useCallback(
    async (id: string, dedupStrategy?: OrganizationImportDedupStrategy) => {
      const response = await fetch(`/api/organization-imports/${id}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          ...(dedupStrategy ? { dedup_strategy: dedupStrategy } : {}),
        }),
      })
      if (!response.ok) throw await toError(response)
      const result = (await response.json()) as CommitResult
      await refresh()
      return result
    },
    [refresh],
  )

  const rollback = React.useCallback(
    async (id: string) => {
      const response = await fetch(`/api/organization-imports/${id}/rollback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      })
      if (!response.ok) throw await toError(response)
      const result = (await response.json()) as RollbackResult
      await refresh()
      return result
    },
    [refresh],
  )

  return {
    imports,
    loading,
    error,
    unavailable,
    refresh,
    upload,
    preview,
    commit,
    rollback,
  }
}

async function toError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as ApiError
  return new Error(body.error?.message ?? `HTTP ${response.status}`)
}
