import { createBrowserClient } from "@supabase/ssr"

/**
 * Create a Supabase client for the browser.
 *
 * Uses cookie-based session storage so server components and
 * middleware can read the same session.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
