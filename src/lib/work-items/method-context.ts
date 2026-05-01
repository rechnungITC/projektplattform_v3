/**
 * Method context helpers (PROJ-6) — resolves the active project method and
 * the kinds creatable for it.
 *
 * `projects.project_method` is now nullable (PROJ-6 migration). NULL means
 * "no method chosen yet" — every kind is creatable in that state, so the
 * user can structure freely before committing.
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
 * Reads `projects.project_method` for the given project.
 *
 * - Returns `null` ("no method chosen yet") while loading, on error,
 *   or when the column is unset.
 * - Safe to call in any client component within a project route;
 *   cleans up on unmount.
 */
export function useCurrentProjectMethod(
  projectId: string | null | undefined
): ProjectMethod | null {
  const [method, setMethod] = React.useState<ProjectMethod | null>(null)

  React.useEffect(() => {
    if (!projectId) {
      setMethod(null)
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
          setMethod(null)
          return
        }

        const raw = (data as { project_method?: string | null } | null)
          ?.project_method
        if (raw && (PROJECT_METHODS as readonly string[]).includes(raw)) {
          setMethod(raw as ProjectMethod)
        } else {
          setMethod(null)
        }
      } catch {
        if (!cancelled) setMethod(null)
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
 * `WORK_ITEM_KINDS` order. When method is null, every kind is creatable.
 * Bug is always included for non-null methods (cross-method per V2 EP-07-ST-04).
 */
export function kindsForMethod(
  method: ProjectMethod | null
): WorkItemKind[] {
  if (method === null) return [...WORK_ITEM_KINDS]
  return WORK_ITEM_KINDS.filter((kind) =>
    WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
  )
}

/**
 * True when the given kind is creatable in the given method.
 * When method is null, returns true (every kind is creatable).
 */
export function isKindCreatable(
  kind: WorkItemKind,
  method: ProjectMethod | null
): boolean {
  if (method === null) return true
  return WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)
}
