"use client"

import * as React from "react"

import { NewSprintDialog } from "@/components/sprints/new-sprint-dialog"
import { SprintsList } from "@/components/sprints/sprints-list"
import {
  BacklogToolbar,
  type BacklogFilters,
  type BacklogViewMode,
} from "@/components/work-items/backlog-toolbar"
import { BacklogBoard } from "@/components/work-items/backlog-board"
import { BacklogDndProvider } from "@/components/work-items/backlog-dnd-provider"
import { BacklogDropZone } from "@/components/work-items/backlog-drop-zone"
import { BacklogList } from "@/components/work-items/backlog-list"
import { BacklogTree } from "@/components/work-items/backlog-tree"
import { BulkAssignPhaseDialog } from "@/components/work-items/bulk-assign-phase-dialog"
import { ChangeParentDialog } from "@/components/work-items/change-parent-dialog"
import { ChangeStatusDialog } from "@/components/work-items/change-status-dialog"
import { DeleteWorkItemDialog } from "@/components/work-items/delete-work-item-dialog"
import { EditWorkItemDialog } from "@/components/work-items/edit-work-item-dialog"
import { NewWorkItemDialog } from "@/components/work-items/new-work-item-dialog"
import { WorkItemDetailDrawer } from "@/components/work-items/work-item-detail-drawer"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown, Plus } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { usePhases } from "@/hooks/use-phases"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useSprints } from "@/hooks/use-sprints"
import { useWorkItems } from "@/hooks/use-work-items"
import { getMethodConfig } from "@/lib/method-templates"
import { useCurrentProjectMethod } from "@/lib/work-items/method-context"
import type { WorkItemKind, WorkItemWithProfile } from "@/types/work-item"

/**
 * PROJ-36 Phase 36-γ — localStorage key for view-mode persistence.
 * One slot per (user_id, project_id) combination.
 */
function viewModeStorageKey(userId: string, projectId: string): string {
  return `wbs-view-mode-${userId}-${projectId}`
}

interface BacklogClientProps {
  projectId: string
  tenantId: string
}

const DEFAULT_FILTERS: BacklogFilters = {
  kinds: [],
  statuses: [],
  responsibleUserId: null,
  bugsOnly: false,
}

export function BacklogClient({ projectId, tenantId: _tenantId }: BacklogClientProps) {
  const method = useCurrentProjectMethod(projectId)
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { user } = useAuth()
  // PROJ-28: hide Sprints in non-agile methods. Backend already
  // hard-blocks sprint INSERT in those methods (PROJ-26), so this is a
  // pure UX-cleanup. Method = null (Setup) keeps Sprints visible
  // because every construct is permitted until a method is chosen.
  const showSprints = method === null || getMethodConfig(method).hasSprints

  const [filters, setFilters] = React.useState<BacklogFilters>(DEFAULT_FILTERS)
  // PROJ-36 Phase 36-γ — view mode default heuristic + localStorage persistence:
  //   1. localStorage value (if valid) wins.
  //   2. Otherwise default to "tree" if any item has a parent_id, else "list".
  //   3. Persist on change (per user_id × project_id).
  const [viewMode, setViewMode] = React.useState<BacklogViewMode>("list")
  const [viewModeReady, setViewModeReady] = React.useState(false)

  const {
    items,
    loading: itemsLoading,
    refresh: refreshItems,
  } = useWorkItems(projectId, {
    kinds: filters.kinds.length ? filters.kinds : undefined,
    statuses: filters.statuses.length ? filters.statuses : undefined,
    responsibleUserId: filters.responsibleUserId ?? undefined,
    bugsOnly: filters.bugsOnly,
  })

  // PROJ-36 Phase 36-γ — resolve initial view-mode once items are loaded.
  // Pinned to a ref so the heuristic doesn't fight the user when items
  // change later (e.g. after a filter narrows the result set).
  React.useEffect(() => {
    if (viewModeReady) return
    if (typeof window === "undefined" || !user?.id) return

    const stored = window.localStorage.getItem(
      viewModeStorageKey(user.id, projectId)
    )
    if (stored === "list" || stored === "tree" || stored === "board") {
      // One-shot initial sync from localStorage; further changes flow via
      // handleViewModeChange. The setStates here run only once per mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewMode(stored)
      setViewModeReady(true)
      return
    }

    // Heuristic only fires after the initial fetch settles.
    if (itemsLoading) return
    const hasHierarchy = items.some((it) => it.parent_id !== null)
    setViewMode(hasHierarchy ? "tree" : "list")
    setViewModeReady(true)
  }, [viewModeReady, user?.id, projectId, items, itemsLoading])

  // Bulk-selection state — declared above handleViewModeChange so the
  // setter is available there. Only used in list-view.
  const [selectedIdsState, setSelectedIdsState] = React.useState<Set<string>>(
    new Set(),
  )

  // Persist on change. (Plain function — React Compiler memoizes; manual
  // useCallback would conflict with its inferred dependency analysis.)
  const handleViewModeChange = (next: BacklogViewMode) => {
    setViewMode(next)
    // Bulk-selection only exists in list-view; drop it on switch-away.
    if (next !== "list") setSelectedIdsState(new Set())
    if (typeof window === "undefined" || !user?.id) return
    // Only persist "list" / "tree" — board is the legacy preference,
    // still allowed but the spec only persists list/tree.
    try {
      window.localStorage.setItem(
        viewModeStorageKey(user.id, projectId),
        next,
      )
    } catch {
      // Quota / disabled storage — silently drop.
    }
  }

  const {
    sprints,
    loading: sprintsLoading,
    refresh: refreshSprints,
  } = useSprints(projectId)

  // Phase-Lookup für Phase-Spalte in Backlog-List + Tree.
  // Bei Methoden ohne Phasen (Scrum/Kanban) bleibt die Liste leer und die
  // Spalte rendert "—" für alle Items.
  const { phases } = usePhases(projectId)

  // Dialogs / drawer state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createKind, setCreateKind] = React.useState<WorkItemKind | null>(null)

  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [drawerItemId, setDrawerItemId] = React.useState<string | null>(null)

  const [editTarget, setEditTarget] =
    React.useState<WorkItemWithProfile | null>(null)
  const [statusTarget, setStatusTarget] =
    React.useState<WorkItemWithProfile | null>(null)
  const [parentTarget, setParentTarget] =
    React.useState<WorkItemWithProfile | null>(null)
  const [deleteTarget, setDeleteTarget] =
    React.useState<WorkItemWithProfile | null>(null)

  const [newSprintOpen, setNewSprintOpen] = React.useState(false)
  const [sprintItemsRefreshKey, setSprintItemsRefreshKey] = React.useState(0)

  const refreshAfterSprintDnd = async () => {
    await refreshItems()
    setSprintItemsRefreshKey((key) => key + 1)
  }

  const refreshSprintSection = async () => {
    await Promise.all([refreshItems(), refreshSprints()])
    setSprintItemsRefreshKey((key) => key + 1)
  }

  // Alias the state-pair declared at the top so the rest of the component
  // can use the cleaner names.
  const selectedIds = selectedIdsState
  const setSelectedIds = setSelectedIdsState
  const [bulkAssignPhaseOpen, setBulkAssignPhaseOpen] = React.useState(false)

  // Derived: only ids that still exist in the current items list. Stale
  // ids (item deleted/filtered) silently drop out instead of being
  // mutated in an effect.
  const selectedItems = React.useMemo(
    () => items.filter((it) => selectedIds.has(it.id)),
    [items, selectedIds],
  )

  const handleCreateRequest = (initialKind: WorkItemKind) => {
    setCreateKind(initialKind)
    setCreateOpen(true)
  }

  const handleSelect = (id: string) => {
    setDrawerItemId(id)
    setDrawerOpen(true)
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // PROJ-25b — view-mode content (list/board/tree). Wrapped in BacklogDropZone
  // only when sprints are active; the drop-zone catches sprint→backlog detach
  // drags and is meaningless without a sprints section. Reused below across
  // both branches of the DnD-conditional render.
  const viewContent = (
    <div className="mt-6">
      {viewMode === "list" && (
        <BacklogList
          projectId={projectId}
          items={items}
          phases={phases}
          loading={itemsLoading}
          onSelect={handleSelect}
          onEditRequest={setEditTarget}
          onChangeStatusRequest={setStatusTarget}
          onChangeParentRequest={setParentTarget}
          onDeleteRequest={setDeleteTarget}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}
      {viewMode === "board" && (
        <BacklogBoard
          projectId={projectId}
          items={items}
          loading={itemsLoading}
          onSelect={handleSelect}
          onChanged={refreshItems}
        />
      )}
      {viewMode === "tree" && (
        <BacklogTree
          projectId={projectId}
          items={items}
          phases={phases}
          loading={itemsLoading}
          onSelect={handleSelect}
          onEditRequest={setEditTarget}
          onChangeStatusRequest={setStatusTarget}
          onChangeParentRequest={setParentTarget}
          onDeleteRequest={setDeleteTarget}
          onChanged={refreshItems}
        />
      )}
    </div>
  )

  const toolbarAndBulk = (
    <>
      <BacklogToolbar
        projectId={projectId}
        method={method}
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        onCreateRequest={handleCreateRequest}
      />

      {/* Bulk-action bar — only in list-view, only when selection > 0. */}
      {viewMode === "list" && selectedIds.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-2 text-sm">
          <span className="font-medium">
            {selectedIds.size} ausgewählt
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {phases.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkAssignPhaseOpen(true)}
              >
                Phase zuweisen
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Auswahl aufheben
            </Button>
          </span>
        </div>
      ) : null}
    </>
  )

  const sprintsSection = showSprints ? (
        <Collapsible className="mt-8 rounded-lg border" defaultOpen>
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-medium hover:opacity-80"
              >
                <ChevronDown className="h-4 w-4" />
                Sprints
                <span className="text-muted-foreground">({sprints.length})</span>
              </button>
            </CollapsibleTrigger>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNewSprintOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" /> Neuer Sprint
              </Button>
            )}
          </div>
          <CollapsibleContent>
            <div className="border-t px-4 py-3">
              <SprintsList
                projectId={projectId}
                sprints={sprints}
                loading={sprintsLoading}
                onChanged={refreshSprintSection}
                refreshKey={sprintItemsRefreshKey}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      {showSprints ? (
        <BacklogDndProvider
          projectId={projectId}
          items={items}
          sprints={sprints}
          onChanged={refreshAfterSprintDnd}
        >
          {toolbarAndBulk}
          <BacklogDropZone>{viewContent}</BacklogDropZone>
          {sprintsSection}
        </BacklogDndProvider>
      ) : (
        <>
          {toolbarAndBulk}
          {viewContent}
        </>
      )}

      <NewWorkItemDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) setCreateKind(null)
        }}
        projectId={projectId}
        initialKind={createKind}
        method={method}
        onCreated={refreshItems}
      />

      <WorkItemDetailDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (!open) setDrawerItemId(null)
        }}
        projectId={projectId}
        workItemId={drawerItemId}
        method={method}
        onChanged={refreshItems}
      />

      {editTarget && (
        <EditWorkItemDialog
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          projectId={projectId}
          item={editTarget}
          onSaved={refreshItems}
        />
      )}

      {statusTarget && (
        <ChangeStatusDialog
          open={!!statusTarget}
          onOpenChange={(open) => !open && setStatusTarget(null)}
          projectId={projectId}
          item={statusTarget}
          onChanged={refreshItems}
        />
      )}

      {parentTarget && (
        <ChangeParentDialog
          open={!!parentTarget}
          onOpenChange={(open) => !open && setParentTarget(null)}
          projectId={projectId}
          item={parentTarget}
          onChanged={refreshItems}
        />
      )}

      {deleteTarget && (
        <DeleteWorkItemDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          projectId={projectId}
          item={deleteTarget}
          onDeleted={refreshItems}
        />
      )}

      {showSprints && (
        <NewSprintDialog
          open={newSprintOpen}
          onOpenChange={setNewSprintOpen}
          projectId={projectId}
          onCreated={refreshSprints}
        />
      )}

      <BulkAssignPhaseDialog
        open={bulkAssignPhaseOpen}
        onOpenChange={setBulkAssignPhaseOpen}
        projectId={projectId}
        items={selectedItems}
        phases={phases}
        onAssigned={async () => {
          await refreshItems()
          clearSelection()
        }}
      />
    </div>
  )
}
