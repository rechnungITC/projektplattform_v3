"use client"

import { Eye, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Role } from "@/types/auth"
import type { ProjectWithResponsible } from "@/types/project"

import { LifecycleBadge } from "./lifecycle-badge"
import { ProjectTypeBadge } from "./project-type-badge"

interface ProjectsTableProps {
  projects: ProjectWithResponsible[]
  isLoading: boolean
  error: string | null
  emptyMessage: React.ReactNode
  role: Role
  /** When true, render Restore + Hard delete row actions instead of the standard view/delete pair. */
  trashMode?: boolean
  onRequestSoftDelete?: (project: ProjectWithResponsible) => void
  onRequestRestore?: (project: ProjectWithResponsible) => void
  onRequestHardDelete?: (project: ProjectWithResponsible) => void
}

export function ProjectsTable({
  projects,
  isLoading,
  error,
  emptyMessage,
  role,
  trashMode = false,
  onRequestSoftDelete,
  onRequestRestore,
  onRequestHardDelete,
}: ProjectsTableProps) {
  const router = useRouter()

  if (isLoading) {
    return <ProjectsTableSkeleton />
  }
  if (error) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
        {error}
      </p>
    )
  }
  if (projects.length === 0) {
    return <>{emptyMessage}</>
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[200px]">Name</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Responsible</TableHead>
            <TableHead className="hidden sm:table-cell">Updated</TableHead>
            <TableHead className="w-12 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => {
            const handleRowClick = () => {
              router.push(`/projects/${project.id}`)
            }
            return (
              <TableRow
                key={project.id}
                className="cursor-pointer"
                onClick={handleRowClick}
                tabIndex={0}
                role="link"
                aria-label={`View ${project.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleRowClick()
                  }
                }}
              >
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate font-medium">{project.name}</span>
                    {project.project_number ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {project.project_number}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <ProjectTypeBadge type={project.project_type} />
                </TableCell>
                <TableCell>
                  <LifecycleBadge status={project.lifecycle_status} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="truncate text-sm">
                    {project.responsible_display_name ??
                      project.responsible_email ??
                      "—"}
                  </span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {formatRelative(project.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    project={project}
                    role={role}
                    trashMode={trashMode}
                    onRequestSoftDelete={onRequestSoftDelete}
                    onRequestRestore={onRequestRestore}
                    onRequestHardDelete={onRequestHardDelete}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

interface RowActionsProps {
  project: ProjectWithResponsible
  role: Role
  trashMode: boolean
  onRequestSoftDelete?: (project: ProjectWithResponsible) => void
  onRequestRestore?: (project: ProjectWithResponsible) => void
  onRequestHardDelete?: (project: ProjectWithResponsible) => void
}

function RowActions({
  project,
  role,
  trashMode,
  onRequestSoftDelete,
  onRequestRestore,
  onRequestHardDelete,
}: RowActionsProps) {
  const router = useRouter()
  const stop = (event: React.MouseEvent) => {
    event.stopPropagation()
  }

  const canSoftDelete = !trashMode && (role === "admin" || role === "member")
  const canRestore = trashMode && role === "admin"
  const canHardDelete = trashMode && role === "admin"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${project.name}`}
          onClick={stop}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={stop} className="w-44">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            router.push(`/projects/${project.id}`)
          }}
        >
          <Eye className="mr-2 h-4 w-4" aria-hidden />
          View
        </DropdownMenuItem>
        {canSoftDelete && onRequestSoftDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(event) => {
                event.preventDefault()
                onRequestSoftDelete(project)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden />
              Move to trash
            </DropdownMenuItem>
          </>
        ) : null}
        {canRestore && onRequestRestore ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                onRequestRestore(project)
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
              Restore
            </DropdownMenuItem>
          </>
        ) : null}
        {canHardDelete && onRequestHardDelete ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(event) => {
              event.preventDefault()
              onRequestHardDelete(project)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
            Delete forever
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProjectsTableSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading projects">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border p-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="hidden h-5 w-20 md:block" />
          <Skeleton className="h-5 w-20" />
          <div className="flex-1" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  )
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return date.toLocaleDateString()
}
