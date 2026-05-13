"use client"

import { AlertCircle, Loader2, Plus, RefreshCw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ReleaseContextPanel } from "@/components/releases/release-context-panel"
import { ReleaseCreateDialog } from "@/components/releases/release-create-dialog"
import { ReleaseHealthStrip } from "@/components/releases/release-health-strip"
import { ReleaseScopePanel } from "@/components/releases/release-scope-panel"
import { ReleaseStatusBadge } from "@/components/releases/release-status-badge"
import { ReleaseStoryGantt } from "@/components/releases/release-story-gantt"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useProjectReleases,
  useReleaseAssignableItems,
  useReleaseSummary,
} from "@/hooks/use-project-releases"
import { useProjectAccess } from "@/hooks/use-project-access"
import type { ProjectRelease } from "@/types/release"

interface ReleasePageClientProps {
  projectId: string
  projectName: string
}

function formatRange(release: ProjectRelease): string {
  if (release.start_date && release.end_date) {
    return `${release.start_date} - ${release.end_date}`
  }
  if (release.start_date || release.end_date) {
    return release.start_date ?? release.end_date ?? "ohne Zeitraum"
  }
  return "ohne Zeitraum"
}

function ReleaseLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export function ReleasePageClient({
  projectId,
  projectName,
}: ReleasePageClientProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [selectedReleaseId, setSelectedReleaseId] = React.useState<string | null>(
    null
  )

  const {
    releases,
    loading: releasesLoading,
    error: releasesError,
    refresh: refreshReleases,
    createRelease,
  } = useProjectReleases(projectId)
  const selectedRelease =
    releases.find((release) => release.id === selectedReleaseId) ??
    releases[0] ??
    null
  const effectiveReleaseId = selectedRelease?.id ?? null
  const {
    data: summaryData,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary,
  } = useReleaseSummary(projectId, effectiveReleaseId)
  const {
    items: assignableItems,
    loading: assignableLoading,
    error: assignableError,
    refresh: refreshAssignableItems,
    assignRelease,
  } = useReleaseAssignableItems(projectId)

  async function handleCreated(release: ProjectRelease) {
    setSelectedReleaseId(release.id)
    toast.success("Release angelegt.")
    await Promise.all([refreshReleases(), refreshAssignableItems()])
  }

  async function handleAssign(workItemId: string, releaseId: string | null) {
    await assignRelease(workItemId, releaseId)
    await Promise.all([refreshSummary(), refreshAssignableItems()])
    toast.success(releaseId ? "Zum Release hinzugefügt." : "Aus Release entfernt.")
  }

  async function refreshAll() {
    await Promise.all([
      refreshReleases(),
      refreshSummary(),
      refreshAssignableItems(),
    ])
  }

  const summary = summaryData?.summary ?? null

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm text-muted-foreground">{projectName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Releases</h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {releases.length > 0 ? (
            <Select
              value={effectiveReleaseId ?? undefined}
              onValueChange={setSelectedReleaseId}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Release wählen" />
              </SelectTrigger>
              <SelectContent>
                {releases.map((release) => (
                  <SelectItem key={release.id} value={release.id}>
                    {release.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void refreshAll()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            <span className="sr-only">Aktualisieren</span>
          </Button>

          {canEdit ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Neuer Release
            </Button>
          ) : null}
        </div>
      </header>

      {releasesError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle>Daten konnten nicht geladen werden</AlertTitle>
          <AlertDescription>{releasesError}</AlertDescription>
        </Alert>
      ) : null}

      {releasesLoading ? (
        <ReleaseLoadingSkeleton />
      ) : releases.length === 0 ? (
        <section className="rounded-md border bg-card px-5 py-8">
          <div className="max-w-xl space-y-3">
            <h2 className="text-lg font-semibold">Kein Release angelegt</h2>
            <p className="text-sm text-muted-foreground">
              Stories, Tasks und Bugs brauchen einen Release-Container für die
              Timeline.
            </p>
            {canEdit ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Neuer Release
              </Button>
            ) : null}
          </div>
        </section>
      ) : selectedRelease ? (
        <div className="space-y-5">
          <section className="rounded-md border bg-card px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold">
                    {selectedRelease.name}
                  </h2>
                  <ReleaseStatusBadge status={selectedRelease.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatRange(selectedRelease)}
                </p>
              </div>
              {selectedRelease.description ? (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {selectedRelease.description}
                </p>
              ) : null}
            </div>
          </section>

          {summaryError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>Release konnte nicht geladen werden</AlertTitle>
              <AlertDescription>{summaryError}</AlertDescription>
            </Alert>
          ) : null}

          {assignableError ? (
            <Alert>
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>Scope-Liste unvollständig</AlertTitle>
              <AlertDescription>{assignableError}</AlertDescription>
            </Alert>
          ) : null}

          {summaryLoading || !summary ? (
            <ReleaseLoadingSkeleton />
          ) : (
            <>
              {summaryData?.truncated ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  <AlertTitle>Scope begrenzt</AlertTitle>
                  <AlertDescription>
                    Die Timeline zeigt die ersten 500 Work Items.
                  </AlertDescription>
                </Alert>
              ) : null}

              <ReleaseHealthStrip health={summary.health} />
              <ReleaseStoryGantt summary={summary} />

              <Tabs defaultValue="scope" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="scope">Scope</TabsTrigger>
                  <TabsTrigger value="context">Kontext</TabsTrigger>
                </TabsList>
                <TabsContent value="scope">
                  <ReleaseScopePanel
                    summary={summary}
                    candidates={assignableItems}
                    candidatesLoading={assignableLoading}
                    canEdit={canEdit}
                    onAssign={handleAssign}
                  />
                </TabsContent>
                <TabsContent value="context">
                  <ReleaseContextPanel summary={summary} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Lädt
        </div>
      )}

      <ReleaseCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createRelease}
        onCreated={handleCreated}
      />
    </div>
  )
}
