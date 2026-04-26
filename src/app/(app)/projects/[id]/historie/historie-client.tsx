"use client"

import { AlertCircle, History, Loader2 } from "lucide-react"
import * as React from "react"

import { LifecycleBadge } from "@/components/projects/lifecycle-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useProject } from "@/hooks/use-project"
import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types/auth"
import type { ProjectLifecycleEventWithActor } from "@/types/project"

interface ProjectHistorieClientProps {
  projectId: string
}

const PAGE_SIZE = 50

type RawEventRow = {
  id: string
  project_id: string
  from_status: string
  to_status: string
  comment: string | null
  changed_by: string
  changed_at: string
  actor:
    | Pick<Profile, "id" | "email" | "display_name">
    | Pick<Profile, "id" | "email" | "display_name">[]
    | null
}

function normalizeEvent(row: RawEventRow): ProjectLifecycleEventWithActor {
  const actor = Array.isArray(row.actor) ? row.actor[0] ?? null : row.actor
  return {
    id: row.id,
    project_id: row.project_id,
    from_status: row.from_status as ProjectLifecycleEventWithActor["from_status"],
    to_status: row.to_status as ProjectLifecycleEventWithActor["to_status"],
    comment: row.comment,
    changed_by: row.changed_by,
    changed_at: row.changed_at,
    actor_display_name: actor?.display_name ?? null,
    actor_email: actor?.email ?? null,
  }
}

export function ProjectHistorieClient({ projectId }: ProjectHistorieClientProps) {
  const { project, events: initialEvents, isLoading, error, notFound } =
    useProject(projectId)

  const [extraEvents, setExtraEvents] = React.useState<
    ProjectLifecycleEventWithActor[]
  >([])
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [reachedEnd, setReachedEnd] = React.useState(false)
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(null)

  // The /useProject hook already fetched the most recent 20 events. We only
  // start paginating once the user clicks "Load older entries".
  const events = React.useMemo(
    () => [...initialEvents, ...extraEvents],
    [initialEvents, extraEvents]
  )

  const hasInitialFull = initialEvents.length === 20

  async function loadMore() {
    if (loadingMore || reachedEnd) return
    setLoadingMore(true)
    setLoadMoreError(null)

    try {
      const supabase = createClient()
      const last = events[events.length - 1]
      if (!last) {
        setReachedEnd(true)
        return
      }
      const { data, error: fetchError } = await supabase
        .from("project_lifecycle_events")
        .select(
          "id, project_id, from_status, to_status, comment, changed_by, changed_at, actor:profiles!project_lifecycle_events_changed_by_fkey ( id, email, display_name )"
        )
        .eq("project_id", projectId)
        .order("changed_at", { ascending: false })
        .lt("changed_at", last.changed_at)
        .limit(PAGE_SIZE)

      if (fetchError) {
        setLoadMoreError(fetchError.message)
        return
      }

      const nextRows = ((data ?? []) as RawEventRow[]).map(normalizeEvent)
      setExtraEvents((prev) => [...prev, ...nextRows])
      if (nextRows.length < PAGE_SIZE) {
        setReachedEnd(true)
      }
    } catch (err) {
      setLoadMoreError(
        err instanceof Error ? err.message : "Unknown error while loading"
      )
    } finally {
      setLoadingMore(false)
    }
  }

  if (isLoading) {
    return <HistorieSkeleton />
  }

  if (notFound || (!project && !error)) {
    return (
      <Alert role="alert">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Projekt nicht gefunden</AlertTitle>
        <AlertDescription>
          Dieses Projekt existiert nicht oder du hast keine Berechtigung dafür.
        </AlertDescription>
      </Alert>
    )
  }

  if (error || !project) {
    return (
      <Alert role="alert" variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Historie konnte nicht geladen werden</AlertTitle>
        <AlertDescription>{error ?? "Unbekannter Fehler"}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" aria-hidden />
          Historie
        </CardTitle>
        <CardDescription>
          Vollständige Lifecycle-Historie dieses Projekts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Lifecycle-Änderungen aufgezeichnet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Übergang</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Kommentar
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">Von</TableHead>
                  <TableHead>Wann</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <LifecycleBadge status={event.from_status} />
                        <span className="text-muted-foreground">→</span>
                        <LifecycleBadge status={event.to_status} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {event.comment ?? <span className="italic">—</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {event.actor_display_name ?? event.actor_email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(event.changed_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {loadMoreError ? (
          <Alert role="alert" variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>Konnte ältere Einträge nicht laden</AlertTitle>
            <AlertDescription>{loadMoreError}</AlertDescription>
          </Alert>
        ) : null}

        {hasInitialFull && !reachedEnd ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Ältere Einträge laden
            </Button>
          </div>
        ) : null}
        {reachedEnd && events.length > 20 ? (
          <p className="text-center text-xs text-muted-foreground">
            Alle Einträge geladen.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function HistorieSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
