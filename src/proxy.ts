import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

import { resolveMethodAwareRedirect } from "@/lib/method-templates/routing"
import { updateSession } from "@/lib/supabase/middleware"
import { PROJECT_METHODS, type ProjectMethod } from "@/types/project-method"

const PROJECT_PATH_RE = /^\/projects\/([^/]+)(?:\/|$)/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads `projects.project_method` for the project under the requested
 * URL. Returns the method, `null` (project found but method unset), or
 * `undefined` when we shouldn't act (RLS denied, project missing,
 * supabase error). Cookies are not refreshed here — `updateSession`
 * already did that for the live request.
 */
async function fetchProjectMethod(
  request: NextRequest,
  projectId: string,
): Promise<ProjectMethod | null | undefined> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          // Cookie writes are owned by updateSession; this client is
          // read-only.
          setAll: () => undefined,
        },
      },
    )
    const { data, error } = await supabase
      .from("projects")
      .select("project_method")
      .eq("id", projectId)
      .maybeSingle()
    if (error || !data) return undefined
    const raw = (data as { project_method?: string | null }).project_method
    if (raw && (PROJECT_METHODS as readonly string[]).includes(raw)) {
      return raw as ProjectMethod
    }
    return null
  } catch {
    return undefined
  }
}

/**
 * Routing middleware (Next.js 16 Proxy).
 *
 * 1. Refreshes the Supabase session cookie via `updateSession` and lets
 *    its auth-redirect (e.g. login bounce) win when present.
 * 2. PROJ-28: for `/projects/[id]/<slug>` routes, resolves whether
 *    `<slug>` matches the project's method. On mismatch, issues a 308
 *    Permanent Redirect to the method-conformant slug. Canonical and
 *    foreign-method slugs both redirect; canonical stays valid as a
 *    fall-back so old bookmarks never 404.
 */
export async function proxy(request: NextRequest) {
  const sessionResponse = await updateSession(request)

  // If updateSession redirected (auth bounce / unauthenticated → /login,
  // authenticated → /), let that win.
  if (sessionResponse.status >= 300 && sessionResponse.status < 400) {
    return sessionResponse
  }

  const { pathname } = request.nextUrl
  const match = pathname.match(PROJECT_PATH_RE)
  if (!match) return sessionResponse

  const projectId = match[1]
  if (!UUID_RE.test(projectId)) return sessionResponse

  const method = await fetchProjectMethod(request, projectId)
  if (method === undefined) return sessionResponse

  const redirect = resolveMethodAwareRedirect(
    pathname,
    projectId,
    method,
    request.nextUrl.search,
  )
  if (!redirect) return sessionResponse

  console.info(
    "[PROJ-28] method-aware redirect",
    JSON.stringify({
      from_slug: redirect.fromSlug,
      to_slug: redirect.toSlug,
      method,
      project_id: projectId,
      section_id: redirect.sectionId,
    }),
  )

  return NextResponse.redirect(
    new URL(redirect.destination, request.url),
    308,
  )
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - Public assets (svg/png/jpg/jpeg/gif/webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
