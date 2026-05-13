"use client"

import { Badge } from "@/components/ui/badge"
import type { ProjectReleaseSummary } from "@/types/release"

interface ReleaseContextPanelProps {
  summary: ProjectReleaseSummary
}

function range(start: string | null, end: string | null): string {
  if (!start && !end) return "ohne Datum"
  if (start && end) return `${start} - ${end}`
  return start ?? end ?? "ohne Datum"
}

export function ReleaseContextPanel({ summary }: ReleaseContextPanelProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-md border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Sprint-Beitrag</h2>
        </div>
        <div className="divide-y">
          {summary.sprint_contributions.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Keine Sprints im Release-Scope.
            </div>
          ) : (
            summary.sprint_contributions.map((sprint) => (
              <div key={sprint.sprint_id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {sprint.name}
                  </span>
                  <Badge variant="outline">{sprint.item_count}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {range(sprint.start_date, sprint.end_date)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Phasen-Kontext</h2>
        </div>
        <div className="divide-y">
          {summary.phases.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Keine Phasen im Projekt.
            </div>
          ) : (
            summary.phases.slice(0, 8).map((phase) => (
              <div key={phase.id} className="px-4 py-3">
                <div className="truncate text-sm font-medium">{phase.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {range(phase.planned_start, phase.planned_end)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Meilensteine</h2>
        </div>
        <div className="divide-y">
          {summary.milestones.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Keine Meilensteine im Projekt.
            </div>
          ) : (
            summary.milestones.slice(0, 8).map((milestone) => (
              <div key={milestone.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {milestone.name}
                  </span>
                  {milestone.id === summary.release.target_milestone_id ? (
                    <Badge>Target</Badge>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {milestone.target_date ?? "ohne Datum"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
