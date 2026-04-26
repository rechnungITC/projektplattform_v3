"use client"

import { MoreHorizontal, UserPlus } from "lucide-react"
import * as React from "react"

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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { useTenantMembers } from "@/hooks/use-tenant-members"
import type { Role, TenantMember } from "@/types/auth"

import { ChangeRoleDialog } from "./change-role-dialog"
import { InviteMemberDialog } from "./invite-member-dialog"
import { RevokeMemberDialog } from "./revoke-member-dialog"

const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
}

const ROLE_VARIANTS: Record<Role, "default" | "secondary" | "outline"> = {
  admin: "default",
  member: "secondary",
  viewer: "outline",
}

function initialsOf(displayName: string | null, email: string): string {
  const source = (displayName ?? email).trim()
  if (!source) return "?"
  const parts = source.split(/\s+/)
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase()
  }
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase()
}

interface MembersTableProps {
  tenantId: string
}

interface PendingChangeRole {
  member: TenantMember
  newRole: Role
}

export function MembersTable({ tenantId }: MembersTableProps) {
  const { user } = useAuth()
  const { members, loading, error, refresh } = useTenantMembers(tenantId)

  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [pendingRole, setPendingRole] =
    React.useState<PendingChangeRole | null>(null)
  const [pendingRevoke, setPendingRevoke] = React.useState<TenantMember | null>(
    null
  )

  const adminCount = React.useMemo(
    () => members.filter((m) => m.role === "admin").length,
    [members]
  )

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Invite teammates and manage their roles.
            </CardDescription>
          </div>
          <Button
            onClick={() => setInviteOpen(true)}
            className="self-start sm:self-auto"
          >
            <UserPlus className="mr-2 h-4 w-4" aria-hidden />
            Invite member
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <MembersSkeleton />
          ) : error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No members yet. Invite your first teammate to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const isSelf = member.user_id === user.id
                    const isLastAdmin =
                      member.role === "admin" && adminCount <= 1

                    return (
                      <TableRow key={member.membership_id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="text-xs font-medium">
                                {initialsOf(member.display_name, member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {member.display_name ??
                                  member.email.split("@")[0] ??
                                  "Member"}
                                {isSelf && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    (you)
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-muted-foreground sm:hidden">
                                {member.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="truncate text-sm text-muted-foreground">
                            {member.email}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ROLE_VARIANTS[member.role]}>
                            {ROLE_LABELS[member.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <MemberActions
                            member={member}
                            isLastAdmin={isLastAdmin}
                            onChangeRole={(newRole) =>
                              setPendingRole({ member, newRole })
                            }
                            onRevoke={() => setPendingRevoke(member)}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tenantId={tenantId}
        onInvited={refresh}
      />

      {pendingRole && (
        <ChangeRoleDialog
          tenantId={tenantId}
          member={pendingRole.member}
          newRole={pendingRole.newRole}
          open={Boolean(pendingRole)}
          onOpenChange={(open) => {
            if (!open) setPendingRole(null)
          }}
          onChanged={refresh}
        />
      )}

      {pendingRevoke && (
        <RevokeMemberDialog
          tenantId={tenantId}
          member={pendingRevoke}
          open={Boolean(pendingRevoke)}
          onOpenChange={(open) => {
            if (!open) setPendingRevoke(null)
          }}
          onRevoked={refresh}
        />
      )}
    </TooltipProvider>
  )
}

interface MemberActionsProps {
  member: TenantMember
  isLastAdmin: boolean
  onChangeRole: (newRole: Role) => void
  onRevoke: () => void
}

function MemberActions({
  member,
  isLastAdmin,
  onChangeRole,
  onRevoke,
}: MemberActionsProps) {
  // Last-admin guard: can't demote or revoke the only admin from the UI.
  const lockedReason = isLastAdmin
    ? "Tenant must have at least one admin"
    : null

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={`Actions for ${member.display_name ?? member.email}`}
    >
      <MoreHorizontal className="h-4 w-4" aria-hidden />
    </Button>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Manage role</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change role…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={member.role}
              onValueChange={(value) => {
                const next = value as Role
                if (next === member.role) return
                onChangeRole(next)
              }}
            >
              <DropdownMenuRadioItem value="admin">Admin</DropdownMenuRadioItem>
              <RoleRadioItemMaybeLocked
                value="member"
                locked={lockedReason !== null && member.role === "admin"}
                lockedReason={lockedReason}
              >
                Member
              </RoleRadioItemMaybeLocked>
              <RoleRadioItemMaybeLocked
                value="viewer"
                locked={lockedReason !== null && member.role === "admin"}
                lockedReason={lockedReason}
              >
                Viewer
              </RoleRadioItemMaybeLocked>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <RevokeMenuItem
          locked={lockedReason !== null && member.role === "admin"}
          lockedReason={lockedReason}
          onSelect={onRevoke}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RoleRadioItemMaybeLocked({
  value,
  locked,
  lockedReason,
  children,
}: {
  value: Role
  locked: boolean
  lockedReason: string | null
  children: React.ReactNode
}) {
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper because disabled radio items don't fire pointer events */}
          <span className="block">
            <DropdownMenuRadioItem
              value={value}
              disabled
              onSelect={(event) => event.preventDefault()}
            >
              {children}
            </DropdownMenuRadioItem>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">{lockedReason}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <DropdownMenuRadioItem value={value}>{children}</DropdownMenuRadioItem>
  )
}

function RevokeMenuItem({
  locked,
  lockedReason,
  onSelect,
}: {
  locked: boolean
  lockedReason: string | null
  onSelect: () => void
}) {
  if (locked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block">
            <DropdownMenuItem
              disabled
              onSelect={(event) => event.preventDefault()}
              className="text-destructive"
            >
              Revoke membership
            </DropdownMenuItem>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">{lockedReason}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <DropdownMenuItem className="text-destructive" onSelect={onSelect}>
      Revoke membership
    </DropdownMenuItem>
  )
}

function MembersSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading members">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  )
}
