import type { getAuthenticatedUserId } from "./route-helpers"

/**
 * Resolve the user's "active" tenant. The convention across PROJ-33 / PROJ-62
 * routes is: pick the user's earliest membership row. Multi-tenant switching
 * is a future PROJ-55 concern; until then, the first membership wins.
 *
 * Returns the tenant id or null when the user has no membership at all.
 */
export async function resolveActiveTenantId(
  userId: string,
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
): Promise<string | null> {
  const { data } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data?.tenant_id as string | undefined) ?? null
}