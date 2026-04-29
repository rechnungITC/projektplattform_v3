/**
 * PROJ-17 — server-side helpers that gate API routes by tenant module
 * configuration.
 *
 * Looks up the tenant's `active_modules` once and decides whether the
 * incoming request is permitted. Per spec ST-02:
 *   - read endpoints return 404 (no existence leak)
 *   - write endpoints return 403 (the caller knows the surface, just not
 *     allowed)
 */

import type { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import type { ModuleKey } from "@/types/tenant-settings"
import type { createClient } from "@/lib/supabase/server"

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

interface RequireModuleOptions {
  /** "read" → 404 on disabled; "write" → 403 on disabled. */
  intent: "read" | "write"
}

/**
 * Returns null when the module is active. Returns a forwardable error
 * Response when the module is disabled or the lookup fails. The caller
 * is expected to short-circuit on a non-null return.
 *
 * Defensive default: if the tenant_settings row is missing for any
 * reason (legacy tenant, RLS-hidden, race), we treat the module as
 * active so the platform stays usable. The settings bootstrap trigger
 * keeps this from happening for new tenants; the backfill catches
 * existing ones.
 */
export async function requireModuleActive(
  supabase: ServerSupabase,
  tenantId: string,
  module: ModuleKey,
  options: RequireModuleOptions = { intent: "read" }
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("active_modules")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) {
    return apiError("module_lookup_failed", error.message, 500)
  }

  // Settings missing → fail open. Membership / RLS already gates access.
  if (!data) return null

  const active = (data.active_modules as ModuleKey[]) ?? []
  if (active.includes(module)) return null

  if (options.intent === "write") {
    return apiError(
      "module_disabled",
      `The "${module}" module is disabled for this tenant.`,
      403
    )
  }
  // Read intent — return 404 to avoid leaking existence of the surface.
  return apiError("not_found", "Resource not found.", 404)
}
