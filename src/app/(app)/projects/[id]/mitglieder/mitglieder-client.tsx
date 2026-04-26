"use client"

import { MoreHorizontal, UserPlus, Users2 } from "lucide-react"
import * as React from "react"

import { AddProjectMemberDialog } from "@/components/projects/add-project-member-dialog"
import { ChangeProjectRoleDialog } from "@/components/projects/change-project-role-dialog"
import { RemoveProjectMemberDialog } from "@/components/projects/remove-project-member-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useProjectMembers } from "@/hooks/use-project-members"
import {
  PROJECT_ROLE_LABELS,
  type ProjectMembershipWithProfile,
} from "@/types/project-membership"

interface MitgliederClientProps {
  projectId: string
  tenantId: string
  projectName: string
}

function initials(displayName: string | null | undefined, email: string): string {
  const source = displayName?.trim() || email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return iso
  }
}

function roleBadgeVariant(
  role: ProjectMembershipWithProfile["role"]
): "default" | "secondary" | "outline" {
  switch (role) {
    case "lead":
      return "default"
    case "editor":
      return "secondary"
    case "viewer":
      return "outline"
  }
}

export function MitgliederClient({
  projectId,
  tenantId,
  projectName,
}: MitgliederClientProps) {
  const { user } = useAuth()
  const canManage = useProjectAccess(projectId, "manage_members")

  const { members, loading, error, refresh } = useProjectMembers(projectId)

  const [addOpen, setAddOpen] = React.useState(false)
  const [changeTarget, setChangeTarget] =
    React.useState<ProjectMembershipWithProfile | null>(null)
  const [removeTarget, setRemoveTarget] =
    React.useState<ProjectMembershipWithProfile | null>(null)

  const leadCount = React.useMemo(
    () => members.filter((m) => m.role === "lead").length,
    [members]
  )
  const isLastLead = React.useCallback(
    (m: ProjectMembershipWithProfile) => m.role === "lead" && leadCount <= 1,
    [leadCount]
  )

  const existingUserIds = React.useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members]
  )

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users2 className="h-5 w-5" aria-hidden />
              Mitglieder
            </CardTitle>
            <CardDescription>
              {loading
                ? "Mitglieder werden geladen…"
                : `${members.length} ${members.length === 1 ? "Mitglied" : "Mitglieder"} in „${projectName}"`}
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={() => setAddOpen(true)} className="sm:self-end">
              <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              Mitglied hinzufügen
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              Mitglieder konnten nicht geladen werden: {error}
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              canManage={canManage}
              onAdd={() => setAddOpen(true)}
            />
          ) : (
            <TooltipProvider delayDuration={150}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitglied</TableHead>
                    <TableHead>Rolle</TableHead>
                    <TableHead>Hinzugefügt</TableHead>
                    {canManage && (
                      <TableHead className="w-12 text-right">
                        <span className="sr-only">Aktionen</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const isMe = m.user_id === user.id
                    const lastLead = isLastLead(m)
                    const display =
                      m.profile?.display_name ?? m.profile?.email ?? m.user_id
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {initials(
                                  m.profile?.display_name,
                                  m.profile?.email ?? ""
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {display}
                                {isMe && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    (du)
                                  </span>
                                )}
                              </div>
                              {m.profile?.email && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {m.profile.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={roleBadgeVariant(m.role)}>
                            {PROJECT_ROLE_LABELS[m.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(m.created_at)}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Aktionen"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {lastLead ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <DropdownMenuItem
                                          disabled
                                          className="cursor-not-allowed"
                                        >
                                          Rolle ändern
                                        </DropdownMenuItem>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                      Projekt muss mindestens einen Lead haben
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => setChangeTarget(m)}
                                  >
                                    Rolle ändern
                                  </DropdownMenuItem>
                                )}
                                {lastLead ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <DropdownMenuItem
                                          disabled
                                          className="cursor-not-allowed text-destructive"
                                        >
                                          Entfernen
                                        </DropdownMenuItem>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                      Projekt muss mindestens einen Lead haben
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => setRemoveTarget(m)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    Entfernen
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>

      <AddProjectMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        tenantId={tenantId}
        existingUserIds={existingUserIds}
        onAdded={refresh}
      />

      {changeTarget && (
        <ChangeProjectRoleDialog
          open={!!changeTarget}
          onOpenChange={(open) => !open && setChangeTarget(null)}
          projectId={projectId}
          member={changeTarget}
          allMembers={members}
          onChanged={refresh}
        />
      )}

      {removeTarget && (
        <RemoveProjectMemberDialog
          open={!!removeTarget}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          projectId={projectId}
          member={removeTarget}
          allMembers={members}
          onRemoved={refresh}
        />
      )}
    </div>
  )
}

function EmptyState({
  canManage,
  onAdd,
}: {
  canManage: boolean
  onAdd: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
      <Users2 className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div>
        <div className="font-medium">Noch keine Mitglieder</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {canManage
            ? "Lade Tenant-Mitglieder ein, um an diesem Projekt mitzuarbeiten."
            : "Sobald jemand Mitglieder hinzufügt, erscheinen sie hier."}
        </p>
      </div>
      {canManage && (
        <Button onClick={onAdd} variant="outline">
          <UserPlus className="mr-2 h-4 w-4" aria-hidden />
          Erstes Mitglied hinzufügen
        </Button>
      )}
    </div>
  )
}
