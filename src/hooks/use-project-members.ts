"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types/auth"
import type {
  ProjectMembershipWithProfile,
  ProjectRole,
} from "@/types/project-membership"

interface UseProjectMembersResult {
  members: ProjectMembershipWithProfile[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type RawRow = {
  id: string
  project_id: string
  user_id: string
  role: ProjectRole
  created_by: string
  created_at: string
  profile:
    | Pick<Profile, "id" | "email" | "display_name">
    | Pick<Profile, "id" | "email" | "display_name">[]
    | null
}

/**
 * Fetches the project's members + their profile snapshot.
 *
 * PROJ-4 backend pending — gracefully degrades to an empty array if the
 * `project_memberships` table does not yet exist.
 */
export function useProjectMembers(
  projectId: string | null | undefined
): UseProjectMembersResult {
  const [members, setMembers] = React.useState<ProjectMembershipWithProfile[]>(
    []
  )
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setMembers([])
          setLoading(false)
        }
        return
      }
      try {
        const supabase = createClient()
        const { data, error: queryError } = await supabase
          .from("project_memberships")
          .select(
            "id, project_id, user_id, role, created_by, created_at, profile:profiles!project_memberships_user_id_fkey ( id, email, display_name )"
          )
          .eq("project_id", projectId)

        if (cancelled) return
        if (queryError) {
          // Most likely cause right now: the table doesn't exist yet (PROJ-4
          // backend pending). Don't surface this as an error to the user.
          setMembers([])
          setError(null)
          return
        }

        const normalized = ((data ?? []) as RawRow[]).map(
          (row): ProjectMembershipWithProfile => {
            const profile = Array.isArray(row.profile)
              ? row.profile[0] ?? null
              : row.profile
            return {
              id: row.id,
              project_id: row.project_id,
              user_id: row.user_id,
              role: row.role,
              created_by: row.created_by,
              created_at: row.created_at,
              profile,
            }
          }
        )
        setMembers(normalized)
      } catch {
        // Same swallow-the-missing-table pattern as use-project-role.ts.
        if (!cancelled) {
          setMembers([])
          setError(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { members, loading, error, refresh }
}
