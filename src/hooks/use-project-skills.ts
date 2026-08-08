"use client"

import * as React from "react"

import { listProjectSkills } from "@/lib/project-skills/api"
import type { ProjectSkillWithSkill } from "@/types/project-skill"

interface UseProjectSkillsResult {
  projectSkills: ProjectSkillWithSkill[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * PROJ-78 — lists a project's assigned skills (RLS-scoped server-side; write
 * paths live in `lib/project-skills/api`).
 */
export function useProjectSkills(
  projectId: string | null | undefined,
): UseProjectSkillsResult {
  const [projectSkills, setProjectSkills] = React.useState<
    ProjectSkillWithSkill[]
  >([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!projectId) {
      setProjectSkills([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setProjectSkills(await listProjectSkills(projectId))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Konnte Skills nicht laden.",
      )
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setProjectSkills([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      try {
        const rows = await listProjectSkills(projectId)
        if (!cancelled) setProjectSkills(rows)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Konnte Skills nicht laden.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { projectSkills, loading, error, refresh: load }
}