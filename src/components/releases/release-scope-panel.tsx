"use client"

import { Loader2, Link2, Unlink } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { WorkItemPriorityBadge } from "@/components/work-items/work-item-priority-badge"
import { WorkItemStatusBadge } from "@/components/work-items/work-item-status-badge"
import {
  RELEASE_DATE_SOURCE_LABELS,
  type ProjectReleaseSummary,
  type ReleaseAssignableWorkItem,
  type ReleaseTimelineItem,
} from "@/types/release"
import { WORK_ITEM_KIND_LABELS } from "@/types/work-item"

interface ReleaseScopePanelProps {
  summary: ProjectReleaseSummary
  candidates: ReleaseAssignableWorkItem[]
  candidatesLoading: boolean
  canEdit: boolean
  onAssign: (workItemId: string, releaseId: string | null) => Promise<void>
}

function dateRange(item: ReleaseTimelineItem) {
  if (!item.timeline_start || !item.timeline_end) return "Nicht geplant"
  return `${item.timeline_start} - ${item.timeline_end}`
}

export function ReleaseScopePanel({
  summary,
  candidates,
  candidatesLoading,
  canEdit,
  onAssign,
}: ReleaseScopePanelProps) {
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const scopedIds = new Set(summary.items.map((item) => item.id))
  const itemsById = new Map(summary.items.map((item) => [item.id, item]))
  const sprintsById = new Map(
    summary.sprint_contributions.map((sprint) => [sprint.sprint_id, sprint])
  )
  const available = candidates
    .filter((item) => item.release_id !== summary.release.id)
    .filter((item) => !scopedIds.has(item.id))
    .slice(0, 12)

  async function assign(workItemId: string, releaseId: string | null) {
    setBusyId(workItemId)
    setError(null)
    try {
      await onAssign(workItemId, releaseId)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Release-Zuordnung konnte nicht gespeichert werden."
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-md border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Release Scope</h2>
          {error ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priorität</TableHead>
              <TableHead>Zeitraum</TableHead>
              <TableHead>Quelle</TableHead>
              {canEdit ? <TableHead className="w-[88px]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="h-24 text-center text-muted-foreground"
                >
                  Kein Scope im Release.
                </TableCell>
              </TableRow>
            ) : (
              summary.items.map((item) => {
                const explicitlyAssigned = item.release_id === summary.release.id
                const parent = item.parent_id
                  ? itemsById.get(item.parent_id)
                  : null
                const sprint = item.sprint_id
                  ? sprintsById.get(item.sprint_id)
                  : null
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="truncate font-medium">
                          {item.title}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">
                            {WORK_ITEM_KIND_LABELS[item.kind]}
                          </Badge>
                          {explicitlyAssigned ? null : (
                            <Badge variant="secondary" className="text-xs">
                              Geerbt
                            </Badge>
                          )}
                          {item.outside_release_window ? (
                            <Badge variant="outline" className="text-xs">
                              Außerhalb
                            </Badge>
                          ) : null}
                          {sprint ? (
                            <Badge
                              variant="secondary"
                              className="max-w-[220px] truncate text-xs"
                            >
                              Sprint {sprint.name}
                            </Badge>
                          ) : null}
                          {parent ? (
                            <Badge
                              variant="outline"
                              className="max-w-[220px] truncate text-xs"
                            >
                              Parent {parent.title}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <WorkItemStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <WorkItemPriorityBadge priority={item.priority} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dateRange(item)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {RELEASE_DATE_SOURCE_LABELS[item.date_source]}
                      </Badge>
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Aus Release entfernen"
                          disabled={!explicitlyAssigned || busyId === item.id}
                          onClick={() => assign(item.id, null)}
                        >
                          {busyId === item.id ? (
                            <Loader2
                              className="h-4 w-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Unlink className="h-4 w-4" aria-hidden />
                          )}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <aside className="rounded-md border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Nicht im Release</h2>
        </div>
        <div className="divide-y">
          {candidatesLoading ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Lädt
            </div>
          ) : available.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Keine weiteren Stories, Tasks oder Bugs.
            </div>
          ) : (
            available.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {item.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-xs">
                      {WORK_ITEM_KIND_LABELS[item.kind]}
                    </Badge>
                    <WorkItemStatusBadge status={item.status} />
                  </div>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Zum Release hinzufügen"
                    disabled={busyId === item.id}
                    onClick={() => assign(item.id, summary.release.id)}
                  >
                    {busyId === item.id ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <Link2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </aside>
    </section>
  )
}
