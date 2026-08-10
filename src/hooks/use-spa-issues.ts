"use client"

import * as React from "react"

import {
  fetchSpaIssuesSummary,
  listSpaIssues,
  type SpaIssue,
  type SpaIssueFilters,
  type SpaIssueSummaryRow,
} from "@/lib/ma-project/spa-issues-api"

interface UseSpaIssuesResult {
  issues: SpaIssue[]
  summary: SpaIssueSummaryRow[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * PROJ-122 — loads the SPA issues list plus its status summary.
 *
 * Filters are applied server-side so the table and the CSV export always agree
 * on scope. Both calls run under the caller's own RLS, so a member without
 * clearance simply gets a shorter list and smaller counts — the summary comes
 * from a SECURITY INVOKER RPC precisely so the counts cannot leak the
 * existence of confidential issues.
 */
export function useSpaIssues(
  projectId: string | null | undefined,
  filters: SpaIssueFilters
): UseSpaIssuesResult {
  const [issues, setIssues] = React.useState<SpaIssue[]>([])
  const [summary, setSummary] = React.useState<SpaIssueSummaryRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const { status, category, importance, responsibleId } = filters

  const load = React.useCallback(async () => {
    if (!projectId) {
      setIssues([])
      setSummary([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [rows, sum] = await Promise.all([
        listSpaIssues(projectId, { status, category, importance, responsibleId }),
        fetchSpaIssuesSummary(projectId),
      ])
      setIssues(rows)
      setSummary(sum)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Konnte SPA-Issues nicht laden."
      )
    } finally {
      setLoading(false)
    }
  }, [projectId, status, category, importance, responsibleId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setIssues([])
          setSummary([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const [rows, sum] = await Promise.all([
          listSpaIssues(projectId, {
            status,
            category,
            importance,
            responsibleId,
          }),
          fetchSpaIssuesSummary(projectId),
        ])
        if (!cancelled) {
          setIssues(rows)
          setSummary(sum)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Konnte SPA-Issues nicht laden."
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, status, category, importance, responsibleId])

  return { issues, summary, loading, error, refresh: load }
}
