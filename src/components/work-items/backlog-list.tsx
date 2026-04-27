"use client"

import { ChevronRight, MoreHorizontal } from "lucide-react"
import * as React from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { useProjectAccess } from "@/hooks/use-project-access"
import {
  WORK_ITEM_KIND_LABELS,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemPriorityBadge } from "./work-item-priority-badge"
import { WorkItemStatusBadge } from "./work-item-status-badge"

interface BacklogListProps {
  projectId: string
  items: WorkItemWithProfile[]
  loading: boolean
  onSelect: (id: string) => void
  onEditRequest: (item: WorkItemWithProfile) => void
  onChangeStatusRequest: (item: WorkItemWithProfile) => void
  onChangeParentRequest: (item: WorkItemWithProfile) => void
  onDeleteRequest: (item: WorkItemWithProfile) => void
}

export function BacklogList({
  projectId,
  items,
  loading,
  onSelect,
  onEditRequest,
  onChangeStatusRequest,
  onChangeParentRequest,
  onDeleteRequest,
}: BacklogListProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")

  // Build a quick map for parent breadcrumbs.
  const itemsById = React.useMemo(() => {
    const map = new Map<string, WorkItemWithProfile>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  if (loading) {
    return (
      <div role="status" aria-label="Lädt Work Items" className="space-y-2">
        {Array.from({ length: 5 }).map((_, idx) => (
          <Card key={idx}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Noch keine Work Items — leg das erste an.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Typ</TableHead>
            <TableHead>Titel</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-24">Priorität</TableHead>
            <TableHead className="w-44">Verantwortlich</TableHead>
            <TableHead className="w-48">Übergeordnet</TableHead>
            <TableHead className="w-12 text-right" aria-label="Aktionen" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const parent = item.parent_id ? itemsById.get(item.parent_id) : null
            return (
              <TableRow
                key={item.id}
                className="cursor-pointer"
                onClick={() => onSelect(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelect(item.id)
                  }
                }}
                tabIndex={0}
                aria-label={`Work Item: ${item.title}`}
              >
                <TableCell>
                  <WorkItemKindBadge kind={item.kind} />
                </TableCell>
                <TableCell className="max-w-md font-medium">
                  <span className="line-clamp-2 break-words">{item.title}</span>
                </TableCell>
                <TableCell>
                  <WorkItemStatusBadge status={item.status} />
                </TableCell>
                <TableCell>
                  <WorkItemPriorityBadge priority={item.priority} />
                </TableCell>
                <TableCell>
                  {item.responsible_user_id ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {(item.responsible_display_name ??
                            item.responsible_email ??
                            "?")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm">
                        {item.responsible_display_name ??
                          item.responsible_email ??
                          "—"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {parent ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <WorkItemKindBadge kind={parent.kind} iconOnly />
                      <ChevronRight className="h-3 w-3" aria-hidden />
                      <span className="truncate">{parent.title}</span>
                    </div>
                  ) : item.parent_id ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {canEdit ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Aktionen für „${item.title}"`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-48"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            onEditRequest(item)
                          }}
                        >
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            onChangeStatusRequest(item)
                          }}
                        >
                          Status ändern
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault()
                            onChangeParentRequest(item)
                          }}
                        >
                          Übergeordnet ändern
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={(event) => {
                            event.preventDefault()
                            onDeleteRequest(item)
                          }}
                        >
                          Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <span className="sr-only">
                    Typ {WORK_ITEM_KIND_LABELS[item.kind]}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
