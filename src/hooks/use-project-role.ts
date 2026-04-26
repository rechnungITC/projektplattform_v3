"use client"

import * as React from "react"

import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"
import type { ProjectRole } from "@/types/project-membership"

interface UseProjectRoleResult {
  role: ProjectRole | null
  loading: boolean
}

/**
 * Returns the current user's project-level role for `projectId`, or `null`
 * when no membership exists. Tenant admins always resolve to `'lead'`
 * (admin equivalence — see Tech Design § E).
 *
 * PROJ-4 backend pending — gracefully degrades to null until the
 * `project_memberships` table exists.
 */
export function useProjectRole(
  projectId: string | null | undefined
): UseProjectRoleResult {
  const { user, currentRole } = useAuth()
  const [role, setRole] = React.useState<ProjectRole | null>(null)
  const [loading, setLoading] = React.useState<boolean>(Boolean(projectId))

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      if (!projectId || !user?.id) {
        setRole(null)
        setLoading(false)
        return
      }

      // Admin equivalence — tenant admins act as project lead everywhere.
      if (currentRole === "admin") {
        setRole("lead")
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("project_memberships")
          .select("role")
          .eq("project_id", projectId)
          .eq("user_id", user.id)
          .maybeSingle()

        if (cancelled) return

        if (error) {
          // Missing-table or any other error → degrade to null. The backend
          // for PROJ-4 will land later; we don't want to break the UI now.
          setRole(null)
        } else {
          setRole((data?.role as ProjectRole | undefined) ?? null)
        }
      } catch {
        if (!cancelled) {
          setRole(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [projectId, user?.id, currentRole])

  return { role, loading }
}
