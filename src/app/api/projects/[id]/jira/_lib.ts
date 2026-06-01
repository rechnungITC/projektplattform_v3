import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
  requireTenantAdmin,
} from "@/app/api/_lib/route-helpers"
import { readTenantSecret } from "@/lib/connectors/secrets"
import {
  JiraCredentialsSchema,
  type JiraCredentials,
} from "@/lib/jira/client"

export interface JiraRouteAuth {
  userId: string
  tenantId: string
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]
}

export async function authProjectForJira(
  projectId: string,
  action: "view" | "edit",
  opts: { requireTenantAdmin?: boolean } = {}
): Promise<JiraRouteAuth | { error: NextResponse }> {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }

  const access = await requireProjectAccess(supabase, projectId, userId, action)
  if (access.error) return { error: access.error }

  if (opts.requireTenantAdmin) {
    const adminDenial = await requireTenantAdmin(
      supabase,
      access.project.tenant_id,
      userId
    )
    if (adminDenial) return { error: adminDenial }
  }

  return {
    userId,
    tenantId: access.project.tenant_id,
    supabase,
  }
}

export async function readJiraCredentials(
  auth: JiraRouteAuth
): Promise<JiraCredentials | { error: NextResponse }> {
  let payload: unknown = null
  try {
    payload = await readTenantSecret(auth.supabase, auth.tenantId, "jira")
  } catch (err) {
    return {
      error: apiError(
        "credential_read_failed",
        err instanceof Error ? err.message : "Jira credentials unavailable.",
        500
      ),
    }
  }

  if (!payload) {
    return {
      error: apiError(
        "jira_not_configured",
        "Jira-Credentials sind fuer diesen Tenant noch nicht konfiguriert.",
        409
      ),
    }
  }

  const parsed = JiraCredentialsSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      error: apiError(
        "jira_credentials_invalid",
        "Jira-Credentials sind unvollstaendig oder ungueltig.",
        409
      ),
    }
  }

  return parsed.data
}
