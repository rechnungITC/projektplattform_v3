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
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listComplianceTags()
        if (cancelled) return
        setTags(list)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { tags, loading, error, refresh }
}
