import { cookies } from "next/headers"

import type { getAuthenticatedUserId } from "./route-helpers"

/**
 * PROJ-55-α — active-tenant resolver.
 *
 * Resolution order:
 *
 *   1. `active_tenant_id` cookie set by the FE workspace switcher
 *      — validated against `tenant_memberships`. The cookie wins
 *      when valid, even for power users with multiple workspaces.
 *
 *   2. Fallback: the user's earliest `tenant_memberships` row.
 *      This keeps the resolver compatible with legacy single-
 *      workspace users (and with the existing route test mocks
 *      that stub a single `.maybeSingle()` reply).
 *
 *   3. `null` when the user has no memberships at all — callers
 *      should respond with 403 / no-active-tenant.
 *
 * The cookie path is now a hard contract: tampering with the
 * cookie can never let a user write to a workspace they are not
 * a member of (validated server-side every request). When no
 * cookie is set, we still fall back to the first membership for
 * backward compatibility, but the FE `useAuth` provider always
 * writes the cookie on workspace selection, so this fallback only
 * fires for the initial-tenant case and for users with exactly
 * one workspace.
 */
const ACTIVE_TENANT_COOKIE = "active_tenant_id"

export async function resolveActiveTenantId(
  userId: string,
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
): Promise<string | null> {
  // 1) Cookie path — validates membership in a single round-trip.
  const cookieValue = await readCookieSafely()
  if (cookieValue) {
    const { data, error } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .eq("user_id", userId)
      .eq("tenant_id", cookieValue)
      .maybeSingle()
    if (!error && data?.tenant_id) {
      return data.tenant_id as string
    }
    // Invalid / tampered cookie → fall through to membership
    // fallback rather than failing the request; the user still
    // ends up in *some* tenant they are legitimately a member of.
  }

  // 2) Fallback — earliest membership. Same shape the legacy
  //    helper used so existing test mocks keep working.
  const { data } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.tenant_id as string | undefined) ?? null
}

async function readCookieSafely(): Promise<string | null> {
  try {
    const jar = await cookies()
    return jar.get(ACTIVE_TENANT_COOKIE)?.value ?? null
  } catch {
    // `cookies()` only resolves inside a request context. Unit
    // tests with mocked supabase intentionally call this helper
    // without a request — fall through to the membership-based
    // fallback.
    return null
  }
}
