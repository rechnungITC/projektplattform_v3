import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    field?: string
  }
}

/**
 * Standard error response envelope used across PROJ-1 routes.
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  field?: string
): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    { error: field ? { code, message, field } : { code, message } },
    { status }
  )
}

/**
 * Resolve the current user from the SSR cookie session.
 * Returns the user id or null if unauthenticated.
 */
export async function getAuthenticatedUserId(): Promise<{
  userId: string | null
  supabase: Awaited<ReturnType<typeof createClient>>
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { userId: user?.id ?? null, supabase }
}

/**
 * Verify the user is an admin of the given tenant. Uses the user-context
 * client so RLS still applies when reading the membership row.
 *
 * Returns null on success, or a NextResponse error to forward.
 */
export async function requireTenantAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string
): Promise<NextResponse<ApiErrorBody> | null> {
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    return apiError("internal_error", error.message, 500)
  }
  if (!data) {
    return apiError("forbidden", "Not a member of this tenant.", 403)
  }
  if (data.role !== "admin") {
    return apiError("forbidden", "Admin role required.", 403)
  }
  return null
}

/**
 * Verify the user is a member of the given tenant (any role). Mirrors
 * `requireTenantAdmin` but accepts any non-null membership.
 *
 * Returns null on success, or a NextResponse error to forward.
 */
export async function requireTenantMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string
): Promise<NextResponse<ApiErrorBody> | null> {
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    return apiError("internal_error", error.message, 500)
  }
  if (!data) {
    return apiError("forbidden", "Not a member of this tenant.", 403)
  }
  return null
}

/**
 * Project-level access actions. The matrix:
 *   view            tenant_member or higher (any tenant_role) — RLS-equivalent
 *   edit            tenant_admin OR project_lead OR project_editor
 *   manage_members  tenant_admin OR project_lead
 */
export type ProjectAction = "view" | "edit" | "manage_members"

interface ProjectAccessProject {
  id: string
  tenant_id: string
}

type RequireProjectAccessResult =
  | { project: ProjectAccessProject; error?: never }
  | { project?: never; error: NextResponse<ApiErrorBody> }

/**
 * Resolve the project (RLS-scoped, so cross-tenant becomes 404) and verify
 * the caller has the required action. Returns either the project row (so
 * callers don't need a second lookup) or a NextResponse to forward.
 *
 * Defense in depth: RLS still gates every subsequent write. This helper
 * only adds a clean 403 with helpful copy and short-circuits before the
 * route runs DB statements that would otherwise surface as 500/Postgres.
 */
export async function requireProjectAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  userId: string,
  action: ProjectAction
): Promise<RequireProjectAccessResult> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, tenant_id")
    .eq("id", projectId)
    .eq("is_deleted", false)
    .maybeSingle()

  if (projectError) {
    return { error: apiError("internal_error", projectError.message, 500) }
  }
  if (!project) {
    // RLS hides cross-tenant projects → null. Return 404 to avoid leaking
    // existence of projects in other tenants.
    return { error: apiError("not_found", "Project not found.", 404) }
  }

  if (action === "view") {
    return { project }
  }

  const [tenantRes, projectMembershipRes] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", project.tenant_id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("project_memberships")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
  ])

  if (tenantRes.error) {
    return { error: apiError("internal_error", tenantRes.error.message, 500) }
  }
  if (projectMembershipRes.error) {
    return {
      error: apiError("internal_error", projectMembershipRes.error.message, 500),
    }
  }

  const tenantRole = tenantRes.data?.role ?? null
  const projectRole = projectMembershipRes.data?.role ?? null
  const isTenantAdmin = tenantRole === "admin"
  const isProjectLead = projectRole === "lead"
  const isProjectEditor = projectRole === "editor"

  let allowed = false
  let denyMessage = ""
  if (action === "edit") {
    allowed = isTenantAdmin || isProjectLead || isProjectEditor
    denyMessage = "Editor or lead role required to edit this project."
  } else if (action === "manage_members") {
    allowed = isTenantAdmin || isProjectLead
    denyMessage = "Only project leads or tenant admins can manage members."
  }

  if (!allowed) {
    return { error: apiError("forbidden", denyMessage, 403) }
  }

  return { project }
}
