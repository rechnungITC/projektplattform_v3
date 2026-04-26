"use client"

import { ShieldAlert } from "lucide-react"
import * as React from "react"

import { HardDeleteConfirmDialog } from "@/components/projects/hard-delete-confirm-dialog"
import { ProjectsTable } from "@/components/projects/projects-table"
import { RestoreProjectDialog } from "@/components/projects/restore-project-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { useProjects } from "@/hooks/use-projects"
import type { ProjectWithResponsible } from "@/types/project"

export function ProjectsTrashClient() {
  const { currentTenant, currentRole } = useAuth()

  const [pendingRestore, setPendingRestore] =
    React.useState<ProjectWithResponsible | null>(null)
  const [pendingHardDelete, setPendingHardDelete] =
    React.useState<ProjectWithResponsible | null>(null)

  const { projects, isLoading, error, refresh } = useProjects({
    tenantId: currentTenant?.id,
    includeDeleted: true,
  })

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
  if (currentRole !== "admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projects trash</CardTitle>
          <CardDescription>
            Only workspace admins can manage the trash.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert role="alert">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>Permission required</AlertTitle>
            <AlertDescription>
              Ask an admin of <strong>{currentTenant.name}</strong> to restore
              or permanently delete projects.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Projects trash</CardTitle>
          <CardDescription>
            Soft-deleted projects can be restored or permanently deleted from
            here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectsTable
            projects={projects}
            isLoading={isLoading}
            error={error}
            role={currentRole}
            trashMode
            onRequestRestore={(p) => setPendingRestore(p)}
            onRequestHardDelete={(p) => setPendingHardDelete(p)}
            emptyMessage={
              <p className="text-sm text-muted-foreground">
                The trash is empty.
              </p>
            }
          />
        </CardContent>
      </Card>

      {pendingRestore ? (
        <RestoreProjectDialog
          open={Boolean(pendingRestore)}
          onOpenChange={(open) => {
            if (!open) setPendingRestore(null)
          }}
          projectId={pendingRestore.id}
          projectName={pendingRestore.name}
          onRestored={refresh}
        />
      ) : null}

      {pendingHardDelete ? (
        <HardDeleteConfirmDialog
          open={Boolean(pendingHardDelete)}
          onOpenChange={(open) => {
            if (!open) setPendingHardDelete(null)
          }}
          projectId={pendingHardDelete.id}
          projectName={pendingHardDelete.name}
          onDeleted={refresh}
        />
      ) : null}
    </div>
  )
}
