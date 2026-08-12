import { NextResponse } from "next/server"

import {
  isProjectEditAllowed,
  isProjectMemberManagementAllowed,
} from "@/lib/projects/access"
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

type RequireAuditReadResult =
  | { isAdmin: boolean; error?: never }
  | { isAdmin?: never; error: NextResponse<ApiErrorBody> }

/**
 * PROJ-130-γ2 — who may read the audit trail of a tenant.
 *
 * Two kinds of reader, and the difference matters:
 *   - tenant admin: full read, and the only one allowed to switch redaction off
 *   - audit reader (`audit_reader_grants`, possibly time-boxed): read-only
 *     revision access WITHOUT tenant membership, but still subject to the
 *     need-to-know gate from γ1 — a `strict` entry stays invisible without a
 *     confidentiality clearance. That is enforced in the database, not here.
 *
 * Deliberately NOT a fourth `tenant_memberships.role`: that would make the
 * auditor a tenant member everywhere membership alone is checked.
 */
export async function requireAuditRead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  userId: string
): Promise<RequireAuditReadResult> {
  const { data: membership, error: membershipError } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle()

  if (membershipError) {
    return { error: apiError("internal_error", membershipError.message, 500) }
  }
  if (membership?.role === "admin") {
    return { isAdmin: true }
  }

  const { data: hasGrant, error: grantError } = await supabase.rpc(
    "has_audit_reader_grant",
    { p_tenant_id: tenantId }
  )
  if (grantError) {
    return { error: apiError("internal_error", grantError.message, 500) }
  }
  if (hasGrant === true) {
    return { isAdmin: false }
  }

  return {
    error: apiError(
      "forbidden",
      "Admin role or an audit-reader grant is required.",
      403
    ),
  }
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

  // Die Rollenregel selbst liegt in `@/lib/projects/access`, weil die
  // Assistant-Runtime (PROJ-144) sie als Wahrheitswert braucht. Verhalten
  // unverändert — nur die Entscheidung hat jetzt eine einzige Quelle.
  let allowed = false
  let denyMessage = ""
  if (action === "edit") {
    allowed = isProjectEditAllowed(tenantRole, projectRole)
    denyMessage = "Editor or lead role required to edit this project."
  } else if (action === "manage_members") {
    allowed = isProjectMemberManagementAllowed(tenantRole, projectRole)
    denyMessage = "Only project leads or tenant admins can manage members."
  }

  if (!allowed) {
    return { error: apiError("forbidden", denyMessage, 403) }
  }

  return { project }
}
