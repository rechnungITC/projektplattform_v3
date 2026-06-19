import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Routes that require authentication.
 * Anything not in PUBLIC_ROUTES below is treated as public.
 */
const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  // Cron endpoints authenticate via Bearer token (CRON_SECRET), not session
  // cookies. Bypass the auth middleware so Vercel Cron can reach the handler;
  // the route validates the secret itself.
  "/api/cron",
  // PROJ-31 — Magic-Link approval flow. The public approve page and its
  // backing API authenticate via the signed token in the URL, not via a
  // Supabase session cookie. External stakeholders without a Plattform-
  // Account need to reach these routes without bouncing to /login.
  "/approve",
  "/api/approve",
  // PROJ-33 Phase 33-δ — Self-Assessment Magic-Link flow. Same auth model
  // as /approve: signed token in URL, no session cookie. External
  // stakeholders fill out a Skill+Big5 self-assessment without a Plattform-
  // Account.
  "/self-assessment",
  "/api/self-assessment",
  // PROJ-50 — Jira inbound webhook receiver. Jira Cloud calls it without a
  // Supabase session; the route authenticates by hashing the URL token
  // against jira_webhook_tokens. NOTE: only the /webhook/ sub-path is public —
  // the admin /webhook-token management route is NOT matched (no trailing
  // slash after "webhook"), so it stays session-gated.
  "/api/connectors/jira/webhook",
  // PROJ-48 — MCP bridge. Approved external agents call /api/mcp with a
  // tenant-scoped bearer token (no Supabase session); the route authenticates
  // by hashing the token against mcp_access_tokens. The admin token-management
  // route lives under /api/connectors/mcp/tokens and stays session-gated.
  "/api/mcp",
]

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/") return false
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

/**
 * Refresh the Supabase session cookie on every request and
 * redirect unauthenticated users away from protected routes.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: getUser() refreshes the session if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Unauthenticated user trying to access a protected route → /login
  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // Authenticated user landing on auth pages → home
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
