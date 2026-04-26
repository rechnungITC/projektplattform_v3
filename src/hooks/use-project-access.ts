"use client"

import { useAuth } from "@/hooks/use-auth"
import { useProjectRole } from "@/hooks/use-project-role"
import type { ProjectAction } from "@/types/project-membership"

/**
 * Boolean access check for the dual-layer role model in PROJ-4.
 *
 * PROJ-4 backend pending — until `project_memberships` exists, fall back to
 * PROJ-2's tenant-role-only authorization (so existing flows keep working).
 * Tighten when /backend lands.
 */
export function useProjectAccess(
  projectId: string | null | undefined,
  action: ProjectAction
): boolean {
  const { currentRole } = useAuth()
  const { role: projectRole } = useProjectRole(projectId)

  // No tenant context → never allow.
  if (currentRole == null) return false

  switch (action) {
    case "read":
      // Any tenant member can see project rows (PROJ-2 RLS); a project
      // membership obviously also grants read.
      return true

    case "edit_master": {
      if (currentRole === "admin") return true
      if (projectRole === "lead" || projectRole === "editor") return true
      // Permissive fallback: PROJ-2 RLS allows tenant `member` to UPDATE.
      // Until project_memberships ships, keep that working.
      if (projectRole === null && currentRole === "member") return true
      return false
    }

    case "transition": {
      if (currentRole === "admin") return true
      if (projectRole === "lead") return true
      // Permissive fallback (see edit_master).
      if (projectRole === null && currentRole === "member") return true
      return false
    }

    case "manage_members": {
      if (currentRole === "admin") return true
      if (projectRole === "lead") return true
      // No fallback — managing members is a brand-new PROJ-4 capability and
      // not exposed before the backend lands. This still gracefully renders
      // the UI in read-only form.
      return false
    }

    case "delete_hard":
      // Hard delete is admin-only at every layer (RLS + API + UI).
      return currentRole === "admin"

    default: {
      const _exhaustive: never = action
      void _exhaustive
      return false
    }
  }
}
