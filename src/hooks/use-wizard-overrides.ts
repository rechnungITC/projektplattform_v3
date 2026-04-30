"use client"

import * as React from "react"

import {
  listMethodOverrides,
  listProjectTypeOverrides,
} from "@/lib/master-data/api"
import { resolveMethodAvailability } from "@/lib/method-templates/overrides"
import type {
  MethodOverrideRow,
  ProjectTypeOverrideFields,
  ProjectTypeOverrideRow,
} from "@/types/master-data"
import type { ProjectMethod } from "@/types/project-method"
import type { ProjectType } from "@/types/project"

interface WizardOverrides {
  /** True when the override fetches are still in flight. */
  loading: boolean
  /** Map of project-type → override fields. Undefined value means "no override". */
  projectTypeOverrides: Map<ProjectType, ProjectTypeOverrideFields>
  /** Map of method → effective enabled state (default-true for missing rows). */
  methodEnabled: Record<ProjectMethod, boolean>
  /** True when at least one method is explicitly disabled (UI hint). */
  hasMethodOverrides: boolean
}

/**
 * PROJ-5 wizard overrides — fetches PROJ-16 tenant-side overrides so the
 * wizard can:
 *   - filter the method picker to only enabled methods
 *   - render type-specific fields using the tenant's overridden roles + required_info
 *
 * Fail-soft: when the fetch errors (e.g. RLS blocked, network), the UI
 * falls back to the unmodified code catalog. The wizard never refuses
 * to render because of a missing override row.
 */
export function useWizardOverrides(): WizardOverrides {
  const [loading, setLoading] = React.useState(true)
  const [methodRows, setMethodRows] = React.useState<MethodOverrideRow[]>([])
  const [typeRows, setTypeRows] = React.useState<ProjectTypeOverrideRow[]>([])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const [methods, types] = await Promise.all([
          listMethodOverrides().catch(() => [] as MethodOverrideRow[]),
          listProjectTypeOverrides().catch(() => [] as ProjectTypeOverrideRow[]),
        ])
        if (cancelled) return
        setMethodRows(methods)
        setTypeRows(types)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const projectTypeOverrides = React.useMemo(() => {
    const m = new Map<ProjectType, ProjectTypeOverrideFields>()
    for (const r of typeRows) m.set(r.type_key, r.overrides)
    return m
  }, [typeRows])

  const methodEnabled = React.useMemo(
    () => resolveMethodAvailability(methodRows),
    [methodRows]
  )

  const hasMethodOverrides = methodRows.some((r) => r.enabled === false)

  return {
    loading,
    projectTypeOverrides,
    methodEnabled,
    hasMethodOverrides,
  }
}
