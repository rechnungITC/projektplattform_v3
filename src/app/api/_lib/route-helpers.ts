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
