"use client"

import * as React from "react"

import { useBacklogDndOptional } from "@/components/work-items/backlog-dnd-provider"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Sprint } from "@/types/sprint"

import { DroppableSprintCard } from "./droppable-sprint-card"
import { SprintCard } from "./sprint-card"

interface SprintsListProps {
  projectId: string
  sprints: Sprint[]
  loading: boolean
  onChanged: () => void | Promise<void>
  refreshKey?: number
}

export function SprintsList({
  projectId,
  sprints,
  loading,
  onChanged,
  refreshKey = 0,
}: SprintsListProps) {
  // Sprints are drop-targets only when a DnD provider is mounted upstream
  // (i.e. on the Backlog page in Scrum/Hybrid methods). Without a provider,
  // useBacklogDndOptional returns null and we render the plain SprintCard.
  const dnd = useBacklogDndOptional()

  // Active sprint pinned to the top, then planned, then closed.
  const ordered = React.useMemo(() => {
    const order: Record<Sprint["state"], number> = {
      active: 0,
      planned: 1,
      closed: 2,
    }
    return [...sprints].sort((a, b) => order[a.state] - order[b.state])
  }, [sprints])

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Lädt Sprints">
        {Array.from({ length: 2 }).map((_, idx) => (
          <Card key={idx}>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (ordered.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Noch keine Sprints angelegt.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {ordered.map((sprint) =>
        dnd ? (
          <DroppableSprintCard
            key={sprint.id}
            projectId={projectId}
            sprint={sprint}
            onChanged={onChanged}
            refreshKey={refreshKey}
          />
        ) : (
          <SprintCard
            key={sprint.id}
            projectId={projectId}
            sprint={sprint}
            onChanged={onChanged}
            refreshKey={refreshKey}
          />
        )
      )}
    </div>
  )
}
