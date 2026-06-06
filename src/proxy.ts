import * as Sentry from "@sentry/nextjs"
import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

import { resolveMethodAwareRedirect } from "@/lib/method-templates/routing"
import { updateSession } from "@/lib/supabase/middleware"
import { isMethodAwareRoutesEnabled } from "@/lib/tenant-settings/feature-flags"
import { PROJECT_METHODS, type ProjectMethod } from "@/types/project-method"

const PROJECT_PATH_RE = /^\/projects\/([^/]+)(?:\/|$)/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reads `projects.project_method` plus the tenant-level PROJ-28 route flag for
 * the project under the requested URL. Returns undefined when we shouldn't act
 * (RLS denied, project/settings missing in a way we cannot trust, Supabase
 * error). Cookies are not refreshed here — `updateSession` already did that
 * for the live request.
 */
async function fetchProjectMethod(
  request: NextRequest,
  projectId: string,
): Promise<
  | {
      method: ProjectMethod | null
      methodAwareRoutesEnabled: boolean
    }
  | undefined
> {
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
      .select("project_method, tenant_id")
      .eq("id", projectId)
      .maybeSingle()
    if (error || !data) return undefined
    const row = data as {
      project_method?: string | null
      tenant_id?: string | null
    }
    const raw = row.project_method
    let method: ProjectMethod | null = null
    if (raw && (PROJECT_METHODS as readonly string[]).includes(raw)) {
      method = raw as ProjectMethod
    }
    if (!row.tenant_id) return undefined

    const { data: settings, error: settingsError } = await supabase
      .from("tenant_settings")
      .select("feature_flags")
      .eq("tenant_id", row.tenant_id)
      .maybeSingle()
    if (settingsError) return undefined

    return {
      method,
      methodAwareRoutesEnabled: isMethodAwareRoutesEnabled(
        (settings as { feature_flags?: unknown } | null)?.feature_flags,
      ),
    }
  } catch {
    return undefined
  }
}

function addMethodAwareRedirectBreadcrumb(data: {
  from_slug: string
  to_slug: string
  method: ProjectMethod | null
  project_id: string
  section_id: string
}) {
  try {
    Sentry.addBreadcrumb({
      category: "navigation.proj28",
      message: "method-aware redirect",
      level: "info",
      data,
    })
  } catch {
    // Breadcrumbs must never affect routing.
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

  const routing = await fetchProjectMethod(request, projectId)
  if (routing === undefined) return sessionResponse
  if (!routing.methodAwareRoutesEnabled) return sessionResponse

  const redirect = resolveMethodAwareRedirect(
    pathname,
    projectId,
    routing.method,
    request.nextUrl.search,
  )
  if (!redirect) return sessionResponse

  const breadcrumb = {
    from_slug: redirect.fromSlug,
    to_slug: redirect.toSlug,
    method: routing.method,
    project_id: projectId,
    section_id: redirect.sectionId,
  }
  addMethodAwareRedirectBreadcrumb(breadcrumb)

  console.info(
    "[PROJ-28] method-aware redirect",
    JSON.stringify(breadcrumb),
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
