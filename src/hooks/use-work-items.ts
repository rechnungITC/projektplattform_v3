"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types/auth"
import type {
  WorkItem,
  WorkItemKind,
  WorkItemStatus,
  WorkItemWithProfile,
} from "@/types/work-item"

interface UseWorkItemsOptions {
  kinds?: WorkItemKind[]
  statuses?: WorkItemStatus[]
  responsibleUserId?: string | null
  sprintId?: string | null
  parentId?: string | null
  /** Filter to bug kind only — convenience for the cross-method bug filter. */
  bugsOnly?: boolean
  includeDeleted?: boolean
}

interface UseWorkItemsResult {
  items: WorkItemWithProfile[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type RawRow = WorkItem & {
  responsible:
    | Pick<Profile, "id" | "email" | "display_name">
    | Array<Pick<Profile, "id" | "email" | "display_name">>
    | null
}

/**
 * Lists work items for a project.
 *
 * PROJ-9 backend pending — gracefully degrades to [] until tables exist.
 *
 * Order: `position ASC NULLS LAST, created_at ASC`. Filters are pushed
 * through the Supabase query so RLS still applies.
 */
export function useWorkItems(
  projectId: string | null | undefined,
  options: UseWorkItemsOptions = {}
): UseWorkItemsResult {
  const [items, setItems] = React.useState<WorkItemWithProfile[]>([])
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)

  // Stable JSON key so the effect dependency array doesn't churn on
  // identical filter objects passed by parent re-renders.
  const filterKey = JSON.stringify(options)

  const fetchOnce = React.useCallback(async () => {
    if (!projectId) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      let query = supabase
        .from("work_items")
        .select(
          "id, tenant_id, project_id, kind, parent_id, phase_id, milestone_id, sprint_id, title, description, status, priority, responsible_user_id, attributes, position, created_from_proposal_id, created_by, created_at, updated_at, is_deleted, responsible:profiles!work_items_responsible_user_id_fkey ( id, display_name, email )"
        )
        .eq("project_id", projectId)
        .order("position", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })

      if (!options.includeDeleted) {
        query = query.eq("is_deleted", false)
      }

      if (options.bugsOnly) {
        query = query.eq("kind", "bug")
      } else if (options.kinds && options.kinds.length > 0) {
        query = query.in("kind", options.kinds)
      }

      if (options.statuses && options.statuses.length > 0) {
        query = query.in("status", options.statuses)
      }

      if (options.responsibleUserId !== undefined) {
        if (options.responsibleUserId === null) {
          query = query.is("responsible_user_id", null)
        } else {
          query = query.eq("responsible_user_id", options.responsibleUserId)
        }
      }

      if (options.sprintId !== undefined) {
        if (options.sprintId === null) {
          query = query.is("sprint_id", null)
        } else {
          query = query.eq("sprint_id", options.sprintId)
        }
      }

      if (options.parentId !== undefined) {
        if (options.parentId === null) {
          query = query.is("parent_id", null)
        } else {
          query = query.eq("parent_id", options.parentId)
        }
      }

      const { data, error: queryError } = await query

      if (queryError) {
        // PROJ-9 backend pending — table likely doesn't exist yet.
        // Don't surface this as a hard error.
        setItems([])
        setError(null)
        return
      }

      const normalized = ((data ?? []) as unknown as RawRow[]).map(
        (row): WorkItemWithProfile => {
          const responsible = Array.isArray(row.responsible)
            ? row.responsible[0]
            : row.responsible
          return {
            id: row.id,
            tenant_id: row.tenant_id,
            project_id: row.project_id,
            kind: row.kind,
            parent_id: row.parent_id,
            phase_id: row.phase_id,
            milestone_id: row.milestone_id,
            sprint_id: row.sprint_id,
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            responsible_user_id: row.responsible_user_id,
            attributes:
              (row.attributes as Record<string, unknown> | null) ?? {},
            position: row.position,
            created_from_proposal_id: row.created_from_proposal_id,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
            is_deleted: row.is_deleted,
            responsible_display_name: responsible?.display_name ?? null,
            responsible_email: responsible?.email ?? null,
          }
        }
      )

      setItems(normalized)
    } catch {
      // Same swallow-the-missing-table pattern as use-phases.ts.
      setItems([])
      setError(null)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, filterKey])

  React.useEffect(() => {
    void fetchOnce()
  }, [fetchOnce])

  return { items, loading, error, refresh: fetchOnce }
}
