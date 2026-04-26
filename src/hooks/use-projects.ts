"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import {
  decodeCursor,
  encodeCursor,
  type LifecycleStatus,
  type Project,
  type ProjectType,
  type ProjectWithResponsible,
} from "@/types/project"

export const PROJECTS_PAGE_SIZE = 50

interface UseProjectsArgs {
  tenantId: string | null | undefined
  lifecycleStatus?: LifecycleStatus
  projectType?: ProjectType
  responsibleUserId?: string
  includeDeleted?: boolean
  cursor?: string | null
}

interface UseProjectsResult {
  projects: ProjectWithResponsible[]
  nextCursor: string | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type RawProject = Project & {
  responsible: { id: string; email: string; display_name: string | null } | null
}

/**
 * Fetches projects for the given tenant via Supabase (RLS-scoped).
 * Default sort: `updated_at DESC, id DESC`. Cursor pagination, limit 50.
 */
export function useProjects(args: UseProjectsArgs): UseProjectsResult {
  const {
    tenantId,
    lifecycleStatus,
    projectType,
    responsibleUserId,
    includeDeleted = false,
    cursor,
  } = args

  const [projects, setProjects] = React.useState<ProjectWithResponsible[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState<boolean>(Boolean(tenantId))
  const [error, setError] = React.useState<string | null>(null)

  const fetchOnce = React.useCallback(async () => {
    if (!tenantId) {
      setProjects([])
      setNextCursor(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      let query = supabase
        .from("projects")
        .select(
          "id, tenant_id, name, description, project_number, planned_start_date, planned_end_date, responsible_user_id, lifecycle_status, project_type, created_by, created_at, updated_at, is_deleted, responsible:profiles!projects_responsible_user_id_fkey ( id, email, display_name )"
        )
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PROJECTS_PAGE_SIZE + 1)

      if (!includeDeleted) {
        query = query.eq("is_deleted", false)
      } else {
        query = query.eq("is_deleted", true)
      }
      if (lifecycleStatus) {
        query = query.eq("lifecycle_status", lifecycleStatus)
      }
      if (projectType) {
        query = query.eq("project_type", projectType)
      }
      if (responsibleUserId) {
        query = query.eq("responsible_user_id", responsibleUserId)
      }

      if (cursor) {
        const parsed = decodeCursor(cursor)
        if (parsed) {
          // (updated_at, id) < (cursor.updated_at, cursor.id) ordering for stable pagination.
          query = query.or(
            `updated_at.lt.${parsed.updated_at},and(updated_at.eq.${parsed.updated_at},id.lt.${parsed.id})`
          )
        }
      }

      const { data, error: queryError } = await query

      if (queryError) {
        setError(queryError.message)
        setProjects([])
        setNextCursor(null)
        return
      }

      const rows = ((data ?? []) as unknown as Array<
        RawProject & {
          responsible: RawProject["responsible"] | RawProject["responsible"][]
        }
      >).map((row): ProjectWithResponsible => {
        const responsible = Array.isArray(row.responsible)
          ? row.responsible[0]
          : row.responsible
        return {
          id: row.id,
          tenant_id: row.tenant_id,
          name: row.name,
          description: row.description,
          project_number: row.project_number,
          planned_start_date: row.planned_start_date,
          planned_end_date: row.planned_end_date,
          responsible_user_id: row.responsible_user_id,
          lifecycle_status: row.lifecycle_status,
          project_type: row.project_type,
          created_by: row.created_by,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_deleted: row.is_deleted,
          responsible_display_name: responsible?.display_name ?? null,
          responsible_email: responsible?.email ?? null,
        }
      })

      const hasMore = rows.length > PROJECTS_PAGE_SIZE
      const pageRows = hasMore ? rows.slice(0, PROJECTS_PAGE_SIZE) : rows

      setProjects(pageRows)
      if (hasMore) {
        const last = pageRows[pageRows.length - 1]!
        setNextCursor(encodeCursor({ updated_at: last.updated_at, id: last.id }))
      } else {
        setNextCursor(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      setProjects([])
      setNextCursor(null)
    } finally {
      setIsLoading(false)
    }
  }, [
    tenantId,
    lifecycleStatus,
    projectType,
    responsibleUserId,
    includeDeleted,
    cursor,
  ])

  React.useEffect(() => {
    void fetchOnce()
  }, [fetchOnce])

  return {
    projects,
    nextCursor,
    isLoading,
    error,
    refresh: fetchOnce,
  }
}
