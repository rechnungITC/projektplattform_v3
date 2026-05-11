"use client"

import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { HealthSnapshot } from "@/components/project-room/health-snapshot"
import { ReadinessChecklist } from "@/components/project-room/readiness-checklist"
import { ReportsSection } from "@/components/project-room/reports-section"
import { RitualsCard } from "@/components/project-room/rituals-card"
import { PendingApprovalsCard } from "@/components/projects/decisions/pending-approvals-card"
import { EditProjectMasterDataDialog } from "@/components/projects/edit-project-master-data-dialog"
import { HardDeleteConfirmDialog } from "@/components/projects/hard-delete-confirm-dialog"
import { LifecycleBadge } from "@/components/projects/lifecycle-badge"
import { LifecycleTransitionDialog } from "@/components/projects/lifecycle-transition-dialog"
import { ProjectTypeBadge } from "@/components/projects/project-type-badge"
import { RestoreProjectDialog } from "@/components/projects/restore-project-dialog"
import { SoftDeleteConfirmDialog } from "@/components/projects/soft-delete-confirm-dialog"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { useProject } from "@/hooks/use-project"
import { getMethodConfig } from "@/lib/method-templates"
import { useCurrentProjectMethod } from "@/lib/work-items/method-context"
import {
  ALLOWED_TRANSITIONS,
  LIFECYCLE_STATUS_LABELS,
  type LifecycleStatus,
} from "@/types/project"

interface ProjectDetailClientProps {
  projectId: string
}

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const { currentRole, tenantSettings } = useAuth()
  const { project, events, isLoading, error, notFound, refresh } =
    useProject(projectId)
  const method = useCurrentProjectMethod(projectId)
  const config = React.useMemo(() => getMethodConfig(method), [method])

  const [editOpen, setEditOpen] = React.useState(false)
  const [transitionTarget, setTransitionTarget] =
    React.useState<LifecycleStatus | null>(null)
  const [transitionMenuOpen, setTransitionMenuOpen] = React.useState(false)
  const [softDeleteOpen, setSoftDeleteOpen] = React.useState(false)
  const [hardDeleteOpen, setHardDeleteOpen] = React.useState(false)
  const [restoreOpen, setRestoreOpen] = React.useState(false)
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  if (isLoading) {
    return <ProjectDetailSkeleton />
  }
  if (notFound || (!project && !error)) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle>Project not found</AlertTitle>
          <AlertDescription>
            This project does not exist, or you don&apos;t have permission to
            view it.
          </AlertDescription>
        </Alert>
      </div>
    )
  }
  if (error || !project) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert role="alert" variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle>Could not load project</AlertTitle>
          <AlertDescription>{error ?? "Unknown error"}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const canEdit = currentRole === "admin" || currentRole === "member"
  const canSoftDelete = canEdit
  const canHardDelete = currentRole === "admin"
  const canTransition =
    canEdit && !project.is_deleted && ALLOWED_TRANSITIONS[project.lifecycle_status].length > 0

  const allowedTransitions = ALLOWED_TRANSITIONS[project.lifecycle_status]

  return (
    <div className="space-y-6">
      <BackLink />

      {project.is_deleted ? (
        <Alert>
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle>This project is in the trash</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Restore the project to bring it back, or permanently delete it.
            </span>
            {currentRole === "admin" ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRestoreOpen(true)}
                >
                  <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setHardDeleteOpen(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                  Delete forever
                </Button>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Header */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="break-words text-2xl sm:text-3xl">
                {project.name}
              </CardTitle>
              {project.project_number ? (
                <CardDescription>{project.project_number}</CardDescription>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <ProjectTypeBadge type={project.project_type} />
                <LifecycleBadge status={project.lifecycle_status} />
              </div>
            </div>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                  disabled={project.is_deleted}
                >
                  <Pencil className="mr-1 h-4 w-4" aria-hidden />
                  Edit
                </Button>
                {canTransition ? (
                  <DropdownMenu
                    open={transitionMenuOpen}
                    onOpenChange={setTransitionMenuOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button size="sm">
                        Lifecycle action
                        <ChevronDown className="ml-1 h-4 w-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {allowedTransitions.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={(event) => {
                            event.preventDefault()
                            setTransitionMenuOpen(false)
                            setTransitionTarget(status)
                          }}
                        >
                          Move to {LIFECYCLE_STATUS_LABELS[status]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <HealthSnapshot projectId={projectId} />

      {/* PROJ-56 — Readiness checklist surfaces structural setup
          gaps next to the operational HealthSnapshot. Health
          answers "how is it running?", readiness answers "is the
          project actually set up?". */}
      <ReadinessChecklist projectId={projectId} />

      {/* Method-specific rituals reminder */}
      <RitualsCard config={config} />

      {/* PROJ-31 follow-up — pending approvals widget. Self-hides when empty. */}
      <PendingApprovalsCard projectId={projectId} />

      {/* PROJ-21: Reports — Status-Report + Executive-Summary snapshots.
          KI-Kurzfazit-Toggle via tenant_settings.output_rendering_settings.
          ki_narrative_enabled (default false; flip on for pilot tenants). */}
      <ReportsSection
        projectId={projectId}
        kiNarrativeEnabled={
          tenantSettings?.output_rendering_settings?.ki_narrative_enabled ===
          true
        }
      />

      {/* Master data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Master data</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Description" wide>
            {project.description ? (
              <p className="whitespace-pre-wrap text-sm">{project.description}</p>
            ) : (
              <span className="text-sm text-muted-foreground">
                No description
              </span>
            )}
          </Field>
          <Field label="Planned start">
            <span className="text-sm">
              {project.planned_start_date
                ? formatDate(project.planned_start_date)
                : "—"}
            </span>
          </Field>
          <Field label="Planned end">
            <span className="text-sm">
              {project.planned_end_date
                ? formatDate(project.planned_end_date)
                : "—"}
            </span>
          </Field>
          <Field label="Responsible">
            <div className="text-sm">
              <div>{project.responsible_display_name ?? "(former member)"}</div>
              {project.responsible_email ? (
                <div className="text-xs text-muted-foreground">
                  {project.responsible_email}
                </div>
              ) : null}
            </div>
          </Field>
          <Field label="Created">
            <div className="text-sm">
              <div>
                {project.created_by_display_name ??
                  project.created_by_email ??
                  "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDateTime(project.created_at)}
              </div>
            </div>
          </Field>
        </CardContent>
      </Card>

      {/* Lifecycle history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lifecycle history</CardTitle>
          <CardDescription>
            Last {events.length === 0 ? 0 : Math.min(events.length, 20)} events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transitions recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transition</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Comment
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">By</TableHead>
                    <TableHead>When</TableHead>
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
                        {event.actor_display_name ??
                          event.actor_email ??
                          "—"}
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
          {events.length === 20 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the most recent 20 events. Full history view is coming
              soon.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Danger zone */}
      {!project.is_deleted && (canSoftDelete || canHardDelete) ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">
              Danger zone
            </CardTitle>
            <CardDescription>
              Destructive operations on this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canSoftDelete ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium">Move to trash</p>
                  <p className="text-muted-foreground">
                    Hides the project from active views. Can be restored later
                    by an admin.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setSoftDeleteOpen(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                  Move to trash
                </Button>
              </div>
            ) : null}
            {canHardDelete ? (
              <>
                <Separator />
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAdvanced((v) => !v)}
                  >
                    {showAdvanced ? "Hide advanced" : "Show advanced"}
                  </Button>
                  {showAdvanced ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm">
                        <p className="font-medium">Permanently delete</p>
                        <p className="text-muted-foreground">
                          Removes the project and its full lifecycle history.
                          Cannot be undone.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setHardDeleteOpen(true)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                        Permanently delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Dialogs */}
      <EditProjectMasterDataDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSaved={refresh}
      />

      {transitionTarget !== null ? (
        <LifecycleTransitionDialog
          open={transitionTarget !== null}
          onOpenChange={(open) => {
            if (!open) setTransitionTarget(null)
          }}
          projectId={project.id}
          projectName={project.name}
          currentStatus={project.lifecycle_status}
          initialToStatus={transitionTarget}
          onTransitioned={refresh}
        />
      ) : null}

      <SoftDeleteConfirmDialog
        open={softDeleteOpen}
        onOpenChange={setSoftDeleteOpen}
        projectId={project.id}
        projectName={project.name}
        onDeleted={refresh}
      />
      <HardDeleteConfirmDialog
        open={hardDeleteOpen}
        onOpenChange={setHardDeleteOpen}
        projectId={project.id}
        projectName={project.name}
        onDeleted={refresh}
      />
      <RestoreProjectDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        projectId={project.id}
        projectName={project.name}
        onRestored={refresh}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/projects"
      className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
      Back to projects
    </Link>
  )
}

function Field({
  label,
  children,
  wide,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Card>
        <CardHeader className="space-y-3">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    </div>
  )
}

function formatDate(iso: string): string {
  const [yearStr, monthStr, dayStr] = iso.slice(0, 10).split("-")
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  if (!year || !month || !day) return "—"
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
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
