"use client"

import * as React from "react"

import { listComplianceTags } from "@/lib/compliance/api"
import type { ComplianceTag } from "@/lib/compliance/types"

interface UseComplianceTagsResult {
  tags: ComplianceTag[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useComplianceTags(): UseComplianceTagsResult {
  const [tags, setTags] = React.useState<ComplianceTag[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listComplianceTags()
      setTags(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { tags, loading, error, refresh }
}
