"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types/auth"
import type {
  WorkItem,
  WorkItemParentRef,
  WorkItemWithProfile,
} from "@/types/work-item"

interface UseWorkItemResult {
  item: WorkItemWithProfile | null
  /** Parent chain ordered top → direct parent. Empty for top-level items. */
  parentChain: WorkItemParentRef[]
  loading: boolean
  error: string | null
  notFound: boolean
  refresh: () => Promise<void>
}

type RawRow = WorkItem & {
  responsible:
    | Pick<Profile, "id" | "email" | "display_name">
    | Array<Pick<Profile, "id" | "email" | "display_name">>
    | null
}

const MAX_CHAIN_DEPTH = 8

/**
 * Fetches one work item plus its parent chain.
 *
 * PROJ-9 backend pending — gracefully degrades. The parent chain is
 * resolved client-side via successive lookups (cheap up to depth 8).
 */
export function useWorkItem(
  projectId: string | null | undefined,
  workItemId: string | null | undefined
): UseWorkItemResult {
  const [item, setItem] = React.useState<WorkItemWithProfile | null>(null)
  const [parentChain, setParentChain] = React.useState<WorkItemParentRef[]>([])
  const [loading, setLoading] = React.useState<boolean>(
    Boolean(projectId && workItemId)
  )
  const [error, setError] = React.useState<string | null>(null)
  const [notFound, setNotFound] = React.useState(false)

  const fetchOnce = React.useCallback(async () => {
    if (!projectId || !workItemId) {
      setItem(null)
      setParentChain([])
      setLoading(false)
      setNotFound(false)
      return
    }

    setLoading(true)
    setError(null)
    setNotFound(false)

    try {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from("work_items")
        .select(
          "id, tenant_id, project_id, kind, parent_id, phase_id, milestone_id, sprint_id, title, description, status, priority, responsible_user_id, attributes, position, created_from_proposal_id, created_by, created_at, updated_at, is_deleted, responsible:profiles!work_items_responsible_user_id_fkey ( id, display_name, email )"
        )
        .eq("project_id", projectId)
        .eq("id", workItemId)
        .maybeSingle()

      if (queryError) {
        // Likely the table doesn't exist yet (PROJ-9 backend pending).
        setItem(null)
        setParentChain([])
        setError(null)
        setNotFound(false)
        return
      }

      if (!data) {
        setItem(null)
        setParentChain([])
        setNotFound(true)
        return
      }

      const row = data as unknown as RawRow
      const responsible = Array.isArray(row.responsible)
        ? row.responsible[0]
        : row.responsible

      setItem({
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
      })

      // Walk the parent chain. RLS still scopes each row.
      const chain: WorkItemParentRef[] = []
      let nextParentId = row.parent_id
      let depth = 0
      while (nextParentId && depth < MAX_CHAIN_DEPTH) {
        depth += 1
        const { data: parent, error: parentErr } = await supabase
          .from("work_items")
          .select("id, kind, title, parent_id")
          .eq("id", nextParentId)
          .maybeSingle()
        if (parentErr || !parent) break
        const parentRow = parent as unknown as WorkItemParentRef
        chain.unshift(parentRow)
        nextParentId = parentRow.parent_id
      }
      setParentChain(chain)
    } catch {
      setItem(null)
      setParentChain([])
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, workItemId])

  React.useEffect(() => {
    void fetchOnce()
  }, [fetchOnce])

  return { item, parentChain, loading, error, notFound, refresh: fetchOnce }
}
