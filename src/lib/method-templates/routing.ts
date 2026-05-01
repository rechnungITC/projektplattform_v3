/**
 * PROJ-28 — method-aware project-room routing helpers.
 *
 * Per method, a sidebar section can declare a `routeSlug` that
 * overrides the canonical folder slug (`tabPath`). E.g. waterfall's
 * Backlog section keeps the page code in `app/(app)/projects/[id]/
 * backlog/` (canonical) but is exposed to the user as
 * `/projects/[id]/arbeitspakete` (route slug). This module is the
 * single source of truth for resolving section ↔ slug ↔ pathname in
 * either direction.
 *
 * Used by:
 * - the project-room sidebar (desktop + mobile) to build href URLs and
 *   compute active-state independently of the slug shown in the URL bar
 * - the top-level Next.js middleware to 308-redirect canonical and
 *   foreign-method slugs onto the active method's slug
 * - any internal `<Link>` that points to a project section
 */

import type { MethodConfig, SidebarSection } from "@/types/method-config"
import type { ProjectMethod } from "@/types/project-method"
import type { ModuleKey, TenantSettings } from "@/types/tenant-settings"
import { isModuleActive } from "@/lib/tenant-settings/modules"

import {
  METHOD_TEMPLATES,
  getMethodConfig,
  neutralFallbackConfig,
} from "./index"

/**
 * Every known method config including the neutral fallback. Used by
 * helpers that must resolve any known slug — e.g. the global scan in
 * `parseSectionFromPathname` for stale URLs that pre-date a method
 * change.
 */
const ALL_CONFIGS: readonly MethodConfig[] = [
  ...Object.values(METHOD_TEMPLATES),
  neutralFallbackConfig,
]

function findSection(
  config: MethodConfig,
  predicate: (section: SidebarSection) => boolean
): SidebarSection | undefined {
  return config.sidebarSections.find(predicate)
}

/**
 * Returns the URL slug used for a section in the given method.
 * Falls back to `tabPath` when no `routeSlug` override is set;
 * returns `null` when the method does not declare such a section.
 */
export function getMethodSlug(
  sectionId: string,
  method: ProjectMethod | null
): string | null {
  const config = getMethodConfig(method)
  const section = findSection(config, (s) => s.id === sectionId)
  if (!section) return null
  return section.routeSlug ?? section.tabPath
}

/**
 * Returns the canonical folder slug (`tabPath`) for a section in the
 * given method. The canonical slug is the actual folder name under
 * `app/(app)/projects/[id]/`. Returns `null` if the method has no
 * such section.
 */
export function getCanonicalSlug(
  sectionId: string,
  method: ProjectMethod | null
): string | null {
  const config = getMethodConfig(method)
  const section = findSection(config, (s) => s.id === sectionId)
  return section?.tabPath ?? null
}

/**
 * Builds the method-conformant href for a project section. The
 * Übersicht section (empty slug) collapses to `/projects/[id]`.
 * Returns `/projects/[id]` for unknown sections — defensive fallback
 * so the user never lands on a broken URL.
 */
export function getProjectSectionHref(
  projectId: string,
  sectionId: string,
  method: ProjectMethod | null
): string {
  const slug = getMethodSlug(sectionId, method)
  if (slug == null || slug === "") return `/projects/${projectId}`
  return `/projects/${projectId}/${slug}`
}

/**
 * Maps a project pathname back to its section id. Resolves canonical
 * AND method-specific slugs against the project's method first; falls
 * back to a global scan across all methods so stale URLs (from before
 * a method change) still highlight the correct sidebar entry until
 * the middleware 308-redirects them.
 *
 * Returns `null` for pathnames that do not match a known section.
 */
export function parseSectionFromPathname(
  pathname: string,
  projectId: string,
  method: ProjectMethod | null = null
): string | null {
  const prefix = `/projects/${projectId}`
  if (!pathname.startsWith(prefix)) return null
  const remainder = pathname.slice(prefix.length)
  if (remainder === "" || remainder === "/") return "overview"
  const firstSegment = remainder
    .replace(/^\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
  if (!firstSegment) return "overview"

  const primary = getMethodConfig(method)
  const primaryHit = findSection(
    primary,
    (s) => s.tabPath === firstSegment || s.routeSlug === firstSegment
  )
  if (primaryHit) return primaryHit.id

  for (const config of ALL_CONFIGS) {
    const hit = findSection(
      config,
      (s) => s.tabPath === firstSegment || s.routeSlug === firstSegment
    )
    if (hit) return hit.id
  }

  return null
}

/**
 * True when `sectionId` is the active section for the given pathname.
 * Compares by section id so canonical and alias slugs resolve to the
 * same active state — independent of which slug the URL bar currently
 * shows.
 */
export function isSectionActive(
  pathname: string,
  projectId: string,
  sectionId: string,
  method: ProjectMethod | null
): boolean {
  return parseSectionFromPathname(pathname, projectId, method) === sectionId
}

/**
 * Filters sections by the tenant's active modules. Sections without a
 * `requiresModule` always pass through. Wraps `isModuleActive` to
 * keep the fail-open behaviour for missing settings consistent.
 */
export function filterSectionsByModules(
  sections: readonly SidebarSection[],
  settings: TenantSettings | null | undefined
): SidebarSection[] {
  return sections.filter(
    (s) => !s.requiresModule || isModuleActive(settings, s.requiresModule)
  )
}

/**
 * Result type for {@link resolveMethodAwareRedirect}. `null` means the
 * current pathname is method-conformant and no redirect is needed.
 */
export interface MethodRedirect {
  fromSlug: string
  toSlug: string
  destination: string
  sectionId: string
}

/**
 * Decides whether a project pathname needs a 308-redirect to the
 * method-conformant slug. Used by the top-level middleware.
 *
 * Behaviour:
 * - Pathname does not target a project section → `null`.
 * - Slug already matches the method's `getMethodSlug(sectionId, method)`
 *   → `null` (no redirect).
 * - Slug recognises a different section in the active method (e.g. a
 *   foreign-method alias) → redirect to the active method's slug.
 *
 * Query strings and hash fragments are preserved through the redirect.
 */
export function resolveMethodAwareRedirect(
  pathname: string,
  projectId: string,
  method: ProjectMethod | null,
  search: string = "",
): MethodRedirect | null {
  const prefix = `/projects/${projectId}`
  if (!pathname.startsWith(prefix)) return null
  const remainder = pathname.slice(prefix.length)
  if (remainder === "" || remainder === "/") return null
  const firstSegment = remainder
    .replace(/^\//, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
  if (!firstSegment) return null

  const sectionId = parseSectionFromPathname(pathname, projectId, method)
  if (!sectionId) return null

  const targetSlug = getMethodSlug(sectionId, method)
  if (targetSlug == null) return null
  if (firstSegment === targetSlug) return null

  // Preserve any extra path under the section, query, hash.
  const tail = remainder
    .replace(/^\//, "")
    .slice(firstSegment.length)
  const destination = targetSlug === ""
    ? `${prefix}${tail}${search}`
    : `${prefix}/${targetSlug}${tail}${search}`

  return {
    fromSlug: firstSegment,
    toSlug: targetSlug,
    destination,
    sectionId,
  }
}
