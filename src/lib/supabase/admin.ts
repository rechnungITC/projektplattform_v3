import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client. Bypasses RLS — server-side only.
 *
 * Use sparingly. Required for:
 *   - auth.admin.* calls (e.g. inviteUserByEmail)
 *   - cross-tenant or system operations that legitimately need to ignore RLS
 *
 * For everything else, prefer the user-context client from
 * `@/lib/supabase/server` so RLS enforces authorization.
 *
 * Throws at call time (not import time) if SUPABASE_SERVICE_ROLE_KEY is
 * missing — this lets the rest of the app build even when the secret is
 * not yet configured locally.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set")
  }
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local — see .env.local.example."
    )
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
