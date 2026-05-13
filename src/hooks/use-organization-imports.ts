"use client"

import * as React from "react"

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

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/organization-imports", {
        cache: "no-store",
      })
      if (!response.ok) throw await toError(response)
      const body = (await response.json()) as { imports: OrganizationImport[] }
      setImports(body.imports ?? [])
    } catch (err) {
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

  return { imports, loading, error, refresh, upload, preview, commit, rollback }
}

async function toError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as ApiError
  return new Error(body.error?.message ?? `HTTP ${response.status}`)
}
