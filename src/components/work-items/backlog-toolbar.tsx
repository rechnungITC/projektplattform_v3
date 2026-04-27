"use client"

import {
  KanbanSquare,
  List,
  Network,
  Plus,
  X,
} from "lucide-react"
import * as React from "react"

import { WorkItemKindBadge } from "@/components/work-items/work-item-kind-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { useAuth } from "@/hooks/use-auth"
import { useProjectAccess } from "@/hooks/use-project-access"
import { kindsForMethod } from "@/lib/work-items/method-context"
import type { ProjectMethod } from "@/types/project-method"
import {
  WORK_ITEM_KIND_LABELS,
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_STATUSES,
  type WorkItemKind,
  type WorkItemStatus,
} from "@/types/work-item"

export type BacklogViewMode = "list" | "board" | "tree"

export interface BacklogFilters {
  kinds: WorkItemKind[]
  statuses: WorkItemStatus[]
  responsibleUserId: string | null
  bugsOnly: boolean
}

interface BacklogToolbarProps {
  projectId: string
  method: ProjectMethod
  filters: BacklogFilters
  onFiltersChange: (next: BacklogFilters) => void
  viewMode: BacklogViewMode
  onViewModeChange: (next: BacklogViewMode) => void
  onCreateRequest: (initialKind: WorkItemKind) => void
}

const RESPONSIBLE_ALL = "__all__"
const RESPONSIBLE_NONE = "__none__"

export function BacklogToolbar({
  projectId,
  method,
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  onCreateRequest,
}: BacklogToolbarProps) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { currentTenant } = useAuth()
  const { members } = useTenantMembers(currentTenant?.id ?? null)

  const availableKinds = React.useMemo(() => kindsForMethod(method), [method])

  const [createOpen, setCreateOpen] = React.useState(false)

  const toggleKind = (kind: WorkItemKind) => {
    const has = filters.kinds.includes(kind)
    const next = has
      ? filters.kinds.filter((k) => k !== kind)
      : [...filters.kinds, kind]
    onFiltersChange({ ...filters, kinds: next })
  }

  const toggleStatus = (status: WorkItemStatus) => {
    const has = filters.statuses.includes(status)
    const next = has
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status]
    onFiltersChange({ ...filters, statuses: next })
  }

  const setResponsible = (value: string) => {
    if (value === RESPONSIBLE_ALL) {
      onFiltersChange({ ...filters, responsibleUserId: null })
      return
    }
    if (value === RESPONSIBLE_NONE) {
      // Treat "Niemand" the same as "All" until we add a real
      // unassigned filter — keeps API simple.
      onFiltersChange({ ...filters, responsibleUserId: null })
      return
    }
    onFiltersChange({ ...filters, responsibleUserId: value })
  }

  const responsibleValue = filters.responsibleUserId ?? RESPONSIBLE_ALL

  const hasAnyFilter =
    filters.kinds.length > 0 ||
    filters.statuses.length > 0 ||
    filters.responsibleUserId !== null ||
    filters.bugsOnly

  const clearFilters = () =>
    onFiltersChange({
      kinds: [],
      statuses: [],
      responsibleUserId: null,
      bugsOnly: false,
    })

  return (
    <div
      className="flex flex-col gap-3 rounded-md border bg-card p-3 shadow-sm"
      role="toolbar"
      aria-label="Backlog-Toolbar"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Kind filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" type="button">
              Typ
              {filters.kinds.length > 0 ? (
                <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-xs font-semibold">
                  {filters.kinds.length}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Typ filtern</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableKinds.map((kind) => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={filters.kinds.includes(kind)}
                onCheckedChange={() => toggleKind(kind)}
                onSelect={(event) => event.preventDefault()}
              >
                {WORK_ITEM_KIND_LABELS[kind]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" type="button">
              Status
              {filters.statuses.length > 0 ? (
                <span className="ml-1 rounded-full bg-secondary px-1.5 py-0.5 text-xs font-semibold">
                  {filters.statuses.length}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel>Status filtern</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {WORK_ITEM_STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={filters.statuses.includes(status)}
                onCheckedChange={() => toggleStatus(status)}
                onSelect={(event) => event.preventDefault()}
              >
                {WORK_ITEM_STATUS_LABELS[status]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Responsible filter */}
        <div className="min-w-44">
          <Select value={responsibleValue} onValueChange={setResponsible}>
            <SelectTrigger className="h-9" aria-label="Verantwortlich filtern">
              <SelectValue placeholder="Verantwortlich" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RESPONSIBLE_ALL}>Alle</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.display_name ?? member.email.split("@")[0]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bugs-only switch */}
        <div className="ml-1 flex items-center gap-2">
          <Switch
            id="bugs-only"
            checked={filters.bugsOnly}
            onCheckedChange={(checked) =>
              onFiltersChange({ ...filters, bugsOnly: checked })
            }
            aria-label="Nur Bugs anzeigen"
          />
          <Label htmlFor="bugs-only" className="cursor-pointer text-sm">
            Nur Bugs
          </Label>
        </div>

        {hasAnyFilter ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden />
            Filter zurücksetzen
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {/* View mode toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) onViewModeChange(value as BacklogViewMode)
            }}
            variant="outline"
            size="sm"
            aria-label="Ansicht wählen"
          >
            <ToggleGroupItem value="list" aria-label="Liste">
              <List className="h-4 w-4" aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="board" aria-label="Board">
              <KanbanSquare className="h-4 w-4" aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="tree" aria-label="Baum">
              <Network className="h-4 w-4" aria-hidden />
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Create — kind picker first */}
          {canEdit ? (
            <DropdownMenu open={createOpen} onOpenChange={setCreateOpen}>
              <DropdownMenuTrigger asChild>
                <Button size="sm" type="button">
                  <Plus className="mr-1 h-4 w-4" aria-hidden />
                  Neues Work Item
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Typ wählen</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableKinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                    onClick={() => {
                      setCreateOpen(false)
                      onCreateRequest(kind)
                    }}
                  >
                    <WorkItemKindBadge kind={kind} />
                  </button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  )
}
