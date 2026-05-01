"use client"

import * as React from "react"

import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types/auth"
import type {
  Project,
  ProjectLifecycleEvent,
  ProjectLifecycleEventWithActor,
  ProjectWithResponsible,
} from "@/types/project"

interface ProjectDetail extends ProjectWithResponsible {
  created_by_display_name: string | null
  created_by_email: string | null
}

interface UseProjectResult {
  project: ProjectDetail | null
  events: ProjectLifecycleEventWithActor[]
  isLoading: boolean
  error: string | null
  notFound: boolean
  refresh: () => Promise<void>
}

type RawProject = Project & {
  responsible: Pick<Profile, "id" | "email" | "display_name"> | null
  creator: Pick<Profile, "id" | "email" | "display_name"> | null
}

type RawEvent = ProjectLifecycleEvent & {
  actor: Pick<Profile, "id" | "email" | "display_name"> | null
}

const EVENT_LIMIT = 20

/**
 * Fetches one project (RLS-scoped) plus its last 20 lifecycle events.
 * Sets `notFound` when the row is missing or hidden by RLS.
 */
export function useProject(
  projectId: string | null | undefined
): UseProjectResult {
  const [project, setProject] = React.useState<ProjectDetail | null>(null)
  const [events, setEvents] = React.useState<ProjectLifecycleEventWithActor[]>(
    []
  )
  const [isLoading, setIsLoading] = React.useState<boolean>(Boolean(projectId))
  const [error, setError] = React.useState<string | null>(null)
  const [notFound, setNotFound] = React.useState<boolean>(false)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!projectId) {
        if (!cancelled) {
          setProject(null)
          setEvents([])
          setIsLoading(false)
          setNotFound(false)
        }
        return
      }
      try {
        const supabase = createClient()

        const projectPromise = supabase
          .from("projects")
          .select(
            "id, tenant_id, name, description, project_number, planned_start_date, planned_end_date, responsible_user_id, lifecycle_status, project_type, created_by, created_at, updated_at, is_deleted, responsible:profiles!projects_responsible_user_id_fkey ( id, email, display_name ), creator:profiles!projects_created_by_fkey ( id, email, display_name )"
          )
          .eq("id", projectId)
          .maybeSingle()

        const eventsPromise = supabase
          .from("project_lifecycle_events")
          .select(
            "id, project_id, from_status, to_status, comment, changed_by, changed_at, actor:profiles!project_lifecycle_events_changed_by_fkey ( id, email, display_name )"
          )
          .eq("project_id", projectId)
          .order("changed_at", { ascending: false })
          .limit(EVENT_LIMIT)

        const [projectRes, eventsRes] = await Promise.all([
          projectPromise,
          eventsPromise,
        ])
        if (cancelled) return

        if (projectRes.error) {
          setError(projectRes.error.message)
          setProject(null)
          setEvents([])
          return
        }

        if (!projectRes.data) {
          setNotFound(true)
          setProject(null)
          setEvents([])
          return
        }

        const raw = projectRes.data as unknown as RawProject & {
          responsible: RawProject["responsible"] | RawProject["responsible"][]
          creator: RawProject["creator"] | RawProject["creator"][]
        }
        const responsible = Array.isArray(raw.responsible)
          ? raw.responsible[0]
          : raw.responsible
        const creator = Array.isArray(raw.creator) ? raw.creator[0] : raw.creator

        setProject({
          id: raw.id,
          tenant_id: raw.tenant_id,
          name: raw.name,
          description: raw.description,
          project_number: raw.project_number,
          planned_start_date: raw.planned_start_date,
          planned_end_date: raw.planned_end_date,
          responsible_user_id: raw.responsible_user_id,
          lifecycle_status: raw.lifecycle_status,
          project_type: raw.project_type,
          created_by: raw.created_by,
          created_at: raw.created_at,
          updated_at: raw.updated_at,
          is_deleted: raw.is_deleted,
          responsible_display_name: responsible?.display_name ?? null,
          responsible_email: responsible?.email ?? null,
          created_by_display_name: creator?.display_name ?? null,
          created_by_email: creator?.email ?? null,
        })

        if (eventsRes.error) {
          // Non-fatal — show project anyway with empty history.
          setEvents([])
        } else {
          const eventRows = ((eventsRes.data ?? []) as unknown as Array<
            RawEvent & { actor: RawEvent["actor"] | RawEvent["actor"][] }
          >).map((row): ProjectLifecycleEventWithActor => {
            const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor
            return {
              id: row.id,
              project_id: row.project_id,
              from_status: row.from_status,
              to_status: row.to_status,
              comment: row.comment,
              changed_by: row.changed_by,
              changed_at: row.changed_at,
              actor_display_name: actor?.display_name ?? null,
              actor_email: actor?.email ?? null,
            }
          })
          setEvents(eventRows)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error")
          setProject(null)
          setEvents([])
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          // Reset notFound state so a subsequent successful fetch clears stale.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { project, events, isLoading, error, notFound, refresh }
}

export type { ProjectDetail }
