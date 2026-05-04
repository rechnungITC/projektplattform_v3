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
  const [tick, setTick] = React.useState(0)

  // Stable JSON key so the effect dependency array doesn't churn on
  // identical filter objects passed by parent re-renders.
  const filterKey = JSON.stringify(options)
  const optionsRef = React.useRef(options)
  optionsRef.current = options

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setItems([])
          setLoading(false)
        }
        return
      }
      try {
        const opts = optionsRef.current
        const supabase = createClient()
        let query = supabase
          .from("work_items")
          .select(
            // PROJ-36 Phase 36-α schema (outline_path, wbs_code,
            // wbs_code_is_custom, derived_*) is currently NOT in production —
            // the α-migration was reverted before the γ-frontend deploy. The
            // hook used to select those columns and PostgREST returned 42703,
            // which the swallow-all catch below turned into a silent empty
            // backlog. Selecting only the safe baseline restores the list
            // until the α-migration is rolled out again.
            "id, tenant_id, project_id, kind, parent_id, phase_id, milestone_id, sprint_id, title, description, status, priority, responsible_user_id, attributes, position, created_from_proposal_id, created_by, created_at, updated_at, is_deleted, responsible:profiles!work_items_responsible_user_id_fkey ( id, display_name, email )"
          )
          .eq("project_id", projectId)
          .order("position", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })

        if (!opts.includeDeleted) {
          query = query.eq("is_deleted", false)
        }

        if (opts.bugsOnly) {
          query = query.eq("kind", "bug")
        } else if (opts.kinds && opts.kinds.length > 0) {
          query = query.in("kind", opts.kinds)
        }

        if (opts.statuses && opts.statuses.length > 0) {
          query = query.in("status", opts.statuses)
        }

        if (opts.responsibleUserId !== undefined) {
          if (opts.responsibleUserId === null) {
            query = query.is("responsible_user_id", null)
          } else {
            query = query.eq("responsible_user_id", opts.responsibleUserId)
          }
        }

        if (opts.sprintId !== undefined) {
          if (opts.sprintId === null) {
            query = query.is("sprint_id", null)
          } else {
            query = query.eq("sprint_id", opts.sprintId)
          }
        }

        if (opts.parentId !== undefined) {
          if (opts.parentId === null) {
            query = query.is("parent_id", null)
          } else {
            query = query.eq("parent_id", opts.parentId)
          }
        }

        const { data, error: queryError } = await query
        if (cancelled) return
        if (queryError) {
          // 42P01 = `undefined_table` — tolerate so a fresh tenant without
          // the work_items table yet doesn't render a hard error. Every
          // other code (42703 missing column, 42501 RLS, network) MUST be
          // surfaced — the previous swallow-all hid a production schema
          // drift for hours (see PROJ-36 α-revert / γ-deploy incident).
          if (queryError.code === "42P01") {
            setItems([])
            setError(null)
            return
          }
          setItems([])
          setError(queryError.message)
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
              outline_path:
                (row as { outline_path?: string | null }).outline_path ?? null,
              wbs_code: (row as { wbs_code?: string | null }).wbs_code ?? null,
              wbs_code_is_custom:
                (row as { wbs_code_is_custom?: boolean }).wbs_code_is_custom ??
                false,
              derived_planned_start:
                (row as { derived_planned_start?: string | null })
                  .derived_planned_start ?? null,
              derived_planned_end:
                (row as { derived_planned_end?: string | null })
                  .derived_planned_end ?? null,
              derived_estimate_hours:
                (row as { derived_estimate_hours?: number | null })
                  .derived_estimate_hours ?? null,
              responsible_display_name: responsible?.display_name ?? null,
              responsible_email: responsible?.email ?? null,
            }
          }
        )
        setItems(normalized)
      } catch (caught) {
        // Network/runtime errors — surface them so they reach Sentry and the
        // user instead of becoming a silent empty list.
        if (!cancelled) {
          setItems([])
          setError(caught instanceof Error ? caught.message : "Failed to load work items.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, filterKey, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { items, loading, error, refresh }
}
