/**
 * Method context helpers — resolves the active project method and the
 * kinds creatable for it. PROJ-7 introduced `projects.project_method`;
 * frontend reads the column with a graceful fallback to `'general'`
 * for projects/migrations that pre-date the column.
 */

"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"
import {
  PROJECT_METHODS,
  type ProjectMethod,
} from "@/types/project-method"

/**
 * Returns the current project method — uses the override when present,
 * otherwise defaults to `'general'`. Server components and tests pass
 * the method directly; client components prefer
 * {@link useCurrentProjectMethod}.
 */
export function getCurrentMethod(
  override?: ProjectMethod | null
): ProjectMethod {
  if (override && (PROJECT_METHODS as readonly string[]).includes(override)) {
    return override
  }
  return "general"
}

/**
 * Reads `projects.project_method` for the given project.
 *
 * - Returns `'general'` while loading, on error, or when the column
 *   doesn't exist yet (graceful degradation for the period between
 *   shipping the frontend and shipping the backend migration).
 * - The hook is safe to call in any client component within a project
 *   route; it cleans up on unmount.
 */
export function useCurrentProjectMethod(
  projectId: string | null | undefined
): ProjectMethod {
  const [method, setMethod] = React.useState<ProjectMethod>("general")

  React.useEffect(() => {
    if (!projectId) {
      setMethod("general")
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("projects")
          .select("project_method")
          .eq("id", projectId)
          .maybeSingle()

        if (cancelled) return

        if (error) {
          // Column not yet present (PROJ-7 backend pending) or other
          // RLS / network error — degrade silently.
          setMethod("general")
          return
        }

        const raw = (data as { project_method?: string | null } | null)
          ?.project_method
        if (raw && (PROJECT_METHODS as readonly string[]).includes(raw)) {
          setMethod(raw as ProjectMethod)
        } else {
          setMethod("general")
        }
      } catch {
        if (!cancelled) setMethod("general")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId])

  return method
}

/**
 * Returns the kinds creatable in the given method, in the canonical
 * `WORK_ITEM_KINDS` order. Bug is always included (cross-method per
 * V2 EP-07-ST-04).
 */
export function kindsForMethod(method: ProjectMethod): WorkItemKind[] {
  return WORK_ITEM_KINDS.filter((kind) =>
    WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
  )
}

/**
 * True when the given kind is creatable in the given method.
 */
export function isKindCreatable(
  kind: WorkItemKind,
  method: ProjectMethod
): boolean {
  return WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
}
