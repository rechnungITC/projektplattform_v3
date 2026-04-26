import type { Profile } from "@/types/auth"

/**
 * Project-level role (PROJ-4). Distinct from the tenant-level role in
 * `@/types/auth`'s `Role`. Tenant admins are treated as project leads
 * by the helper hooks (admin equivalence).
 */
export type ProjectRole = "lead" | "editor" | "viewer"

export const PROJECT_ROLES: readonly ProjectRole[] = [
  "lead",
  "editor",
  "viewer",
] as const

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  lead: "Lead",
  editor: "Editor",
  viewer: "Viewer",
}

/**
 * The granular UI/API actions PROJ-4 gates on.
 * - `read`              — load the project (any tenant member, or any project member)
 * - `edit_master`       — change name/description/dates etc. (admin/lead/editor)
 * - `transition`        — lifecycle transitions + soft-delete (admin/lead)
 * - `manage_members`    — add/change/remove project memberships (admin/lead)
 * - `delete_hard`       — permanent project delete (tenant admin only)
 */
export type ProjectAction =
  | "read"
  | "edit_master"
  | "transition"
  | "manage_members"
  | "delete_hard"

export interface ProjectMembership {
  id: string
  project_id: string
  user_id: string
  role: ProjectRole
  created_by: string
  created_at: string
}

export interface ProjectMembershipWithProfile extends ProjectMembership {
  profile: Pick<Profile, "id" | "email" | "display_name"> | null
}
