"use client"

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"

import { LifecycleBadge } from "@/components/projects/lifecycle-badge"
import { ProjectsTable } from "@/components/projects/projects-table"
import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import { SoftDeleteConfirmDialog } from "@/components/projects/soft-delete-confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { useProjects } from "@/hooks/use-projects"
import {
  LIFECYCLE_STATUSES,
  LIFECYCLE_STATUS_LABELS,
  PROJECT_TYPES,
  PROJECT_TYPE_LABELS,
  type LifecycleStatus,
  type ProjectType,
  type ProjectWithResponsible,
} from "@/types/project"

const STATUS_PARAM = "status"
const TYPE_PARAM = "type"
const RESPONSIBLE_PARAM = "responsible"
const CURSOR_PARAM = "cursor"

const ALL_VALUE = "__all__"

function isLifecycleStatus(value: string | null): value is LifecycleStatus {
  return value !== null && (LIFECYCLE_STATUSES as readonly string[]).includes(value)
}
function isProjectType(value: string | null): value is ProjectType {
  return value !== null && (PROJECT_TYPES as readonly string[]).includes(value)
}

export function ProjectsListClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentTenant, currentRole } = useAuth()

  const lifecycleStatus = isLifecycleStatus(searchParams.get(STATUS_PARAM))
    ? (searchParams.get(STATUS_PARAM) as LifecycleStatus)
    : undefined
  const projectType = isProjectType(searchParams.get(TYPE_PARAM))
    ? (searchParams.get(TYPE_PARAM) as ProjectType)
    : undefined
  const responsibleUserId =
    searchParams.get(RESPONSIBLE_PARAM)?.trim() || undefined
  const cursor = searchParams.get(CURSOR_PARAM) || undefined

  const [pendingDelete, setPendingDelete] =
    React.useState<ProjectWithResponsible | null>(null)
  const [history, setHistory] = React.useState<string[]>([])

  const { projects, nextCursor, isLoading, error, refresh } = useProjects({
    tenantId: currentTenant?.id,
    lifecycleStatus,
    projectType,
    responsibleUserId,
    cursor: cursor ?? null,
  })

  // Reset cursor history when filters change so "Previous" doesn't carry stale cursors.
  const filterKey = `${lifecycleStatus ?? ""}|${projectType ?? ""}|${responsibleUserId ?? ""}`
  const lastFilterKey = React.useRef(filterKey)
  React.useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey
      setHistory([])
    }
  }, [filterKey])

  const updateParam = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      const qs = params.toString()
      router.replace(qs ? `/projects?${qs}` : "/projects", { scroll: false })
    },
    [router, searchParams]
  )

  const handleStatusChange = (next: string) => {
    updateParam((p) => {
      if (next === ALL_VALUE) p.delete(STATUS_PARAM)
      else p.set(STATUS_PARAM, next)
      p.delete(CURSOR_PARAM)
    })
  }
  const handleTypeChange = (next: string) => {
    updateParam((p) => {
      if (next === ALL_VALUE) p.delete(TYPE_PARAM)
      else p.set(TYPE_PARAM, next)
      p.delete(CURSOR_PARAM)
    })
  }
  const handleResponsibleChange = (next: string) => {
    updateParam((p) => {
      if (!next) p.delete(RESPONSIBLE_PARAM)
      else p.set(RESPONSIBLE_PARAM, next)
      p.delete(CURSOR_PARAM)
    })
  }
  const clearFilters = () => {
    updateParam((p) => {
      p.delete(STATUS_PARAM)
      p.delete(TYPE_PARAM)
      p.delete(RESPONSIBLE_PARAM)
      p.delete(CURSOR_PARAM)
    })
  }

  const handleNext = () => {
    if (!nextCursor) return
    setHistory((prev) => [...prev, cursor ?? ""])
    updateParam((p) => p.set(CURSOR_PARAM, nextCursor))
  }
  const handlePrevious = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev
      const newHistory = prev.slice(0, -1)
      const last = prev[prev.length - 1]
      updateParam((p) => {
        if (!last) p.delete(CURSOR_PARAM)
        else p.set(CURSOR_PARAM, last)
      })
      return newHistory
    })
  }

  const canCreate = currentRole === "admin" || currentRole === "member"
  const filtersActive = Boolean(
    lifecycleStatus || projectType || responsibleUserId
  )

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No active workspace</CardTitle>
          <CardDescription>
            Select a workspace from the top-right switcher.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  if (!currentRole) {
    // Defensive — shouldn't happen because (app) layout guards memberships.
    return (
      <p className="text-sm text-muted-foreground">Loading workspace…</p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Projects
          </h1>
          <p className="text-sm text-muted-foreground">
            All active projects in {currentTenant.name}.
          </p>
        </div>
        {canCreate ? (
          <Button asChild className="self-start sm:self-auto">
            <Link href="/projects/new/wizard">
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              New project
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Combine filters to narrow down the list. Bookmark the URL to share
            this view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <Select
                value={lifecycleStatus ?? ALL_VALUE}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger aria-label="Filter by lifecycle status">
                  <SelectValue placeholder="All statuses">
                    {lifecycleStatus ? (
                      <LifecycleBadge status={lifecycleStatus} />
                    ) : (
                      "All statuses"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
                  {LIFECYCLE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {LIFECYCLE_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Type
              </label>
              <Select
                value={projectType ?? ALL_VALUE}
                onValueChange={handleTypeChange}
              >
                <SelectTrigger aria-label="Filter by project type">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All types</SelectItem>
                  {PROJECT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PROJECT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Responsible
              </label>
              <ResponsibleUserPicker
                tenantId={currentTenant.id}
                value={responsibleUserId}
                onChange={handleResponsibleChange}
                includeAllOption
                placeholder="All members"
                ariaLabel="Filter by responsible user"
              />
            </div>
          </div>
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={clearFilters}
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <ProjectsTable
        projects={projects}
        isLoading={isLoading}
        error={error}
        role={currentRole}
        onRequestSoftDelete={(p) => setPendingDelete(p)}
        emptyMessage={
          <Card>
            <CardHeader>
              <CardTitle>No projects yet</CardTitle>
              <CardDescription>
                {filtersActive
                  ? "No projects match your filters. Try clearing them."
                  : canCreate
                    ? "Get started by creating your first project."
                    : "Ask an admin or member to create a project."}
              </CardDescription>
            </CardHeader>
            {canCreate && !filtersActive ? (
              <CardContent>
                <Button asChild>
                  <Link href="/projects/new/wizard">
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Create your first project
                  </Link>
                </Button>
              </CardContent>
            ) : null}
          </Card>
        }
      />

      {(history.length > 0 || nextCursor) && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={history.length === 0}
            className={history.length === 0 ? "invisible" : undefined}
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={!nextCursor}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}

      {pendingDelete ? (
        <SoftDeleteConfirmDialog
          open={Boolean(pendingDelete)}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null)
          }}
          projectId={pendingDelete.id}
          projectName={pendingDelete.name}
          onDeleted={refresh}
        />
      ) : null}
    </div>
  )
}
