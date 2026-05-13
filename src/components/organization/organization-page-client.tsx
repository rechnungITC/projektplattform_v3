"use client"

/**
 * PROJ-62 — Master client for /stammdaten/organisation.
 *
 * Owns the dialogs and coordinates the hooks. The 3-tab layout defaults
 * to "Tree" because hierarchies are easier to read top-down than as a
 * flat list. Filters apply both in Tree and Tabelle tabs.
 */

import * as React from "react"
import { Upload } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLocations } from "@/hooks/use-locations"
import { useOrganizationLandscape } from "@/hooks/use-organization-landscape"
import { useOrganizationTree } from "@/hooks/use-organization-tree"
import { useOrganizationUnits } from "@/hooks/use-organization-units"
import type {
  OrganizationLandscapeItem,
  OrganizationUnit,
  OrganizationUnitTreeNode,
  OrganizationUnitType,
} from "@/types/organization"

import { LocationTable } from "./location-table"
import {
  OrgFilterToolbar,
  type OrgFilterState,
} from "./org-filter-toolbar"
import { OrgDeleteConfirmDialog } from "./org-delete-confirm-dialog"
import { OrgDetailPanel } from "./org-detail-panel"
import { OrgEditDialog } from "./org-edit-dialog"
import { OrgTable } from "./org-table"
import { OrgTree } from "./org-tree"

const DEFAULT_FILTERS: OrgFilterState = {
  search: "",
  types: [],
  locationIds: [],
  showInactive: false,
  showVendors: false,
}

interface OrganizationPageClientProps {
  /** Whether the current user is a tenant-admin (write access). UI-only
   *  hint — the API enforces RLS regardless. */
  canEdit: boolean
}

/** Filter a tree top-down. A node is kept if it matches itself OR has
 *  any descendant that matches. We rebuild the tree to reflect the
 *  filter rather than just hiding rows so the row-virtualizer stays
 *  honest about heights. */
function filterTree(
  nodes: OrganizationUnitTreeNode[],
  filters: OrgFilterState,
): OrganizationUnitTreeNode[] {
  const search = filters.search.trim().toLowerCase()
  const matches = (n: OrganizationUnitTreeNode): boolean => {
    if (filters.types.length > 0 && !filters.types.includes(n.type)) return false
    if (
      filters.locationIds.length > 0 &&
      (!n.location_id || !filters.locationIds.includes(n.location_id))
    )
      return false
    if (!filters.showInactive && !n.is_active) return false
    if (search) {
      const haystack = [
        n.name,
        n.code ?? "",
        n.description ?? "",
      ]
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  }
  const walk = (
    n: OrganizationUnitTreeNode,
  ): OrganizationUnitTreeNode | null => {
    const filteredChildren = n.children.flatMap((c) => {
      const v = walk(c)
      return v ? [v] : []
    })
    if (matches(n) || filteredChildren.length > 0) {
      return { ...n, children: filteredChildren }
    }
    return null
  }
  return nodes.flatMap((n) => {
    const v = walk(n)
    return v ? [v] : []
  })
}

function filterUnits(
  units: OrganizationUnit[],
  filters: OrgFilterState,
): OrganizationUnit[] {
  const search = filters.search.trim().toLowerCase()
  return units.filter((u) => {
    if (filters.types.length > 0 && !filters.types.includes(u.type)) return false
    if (
      filters.locationIds.length > 0 &&
      (!u.location_id || !filters.locationIds.includes(u.location_id))
    )
      return false
    if (!filters.showInactive && !u.is_active) return false
    if (search) {
      const haystack = [u.name, u.code ?? "", u.description ?? ""]
        .join(" ")
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

function filterVendors(
  rows: OrganizationLandscapeItem[],
  filters: OrgFilterState,
): OrganizationLandscapeItem[] {
  const search = filters.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (r.kind !== "vendor") return false
    if (
      filters.locationIds.length > 0 &&
      (!r.location_id || !filters.locationIds.includes(r.location_id))
    )
      return false
    if (search && !r.name.toLowerCase().includes(search)) return false
    return true
  })
}

function findTreeNode(
  nodes: OrganizationUnitTreeNode[],
  id: string,
): OrganizationUnitTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const child = findTreeNode(n.children, id)
    if (child) return child
  }
  return null
}

export function OrganizationPageClient({
  canEdit,
}: OrganizationPageClientProps) {
  const {
    units,
    loading: unitsLoading,
    error: unitsError,
    refresh: refreshUnits,
    create,
    patch,
    move,
    remove,
  } = useOrganizationUnits()

  const {
    locations,
    loading: locationsLoading,
  } = useLocations()

  const [filters, setFilters] = React.useState<OrgFilterState>(DEFAULT_FILTERS)

  const {
    tree,
    loading: treeLoading,
    error: treeError,
    refresh: refreshTree,
  } = useOrganizationTree({ includeVendors: false })

  const {
    items: landscapeItems,
    loading: landscapeLoading,
  } = useOrganizationLandscape(filters.showVendors)

  const [activeTab, setActiveTab] = React.useState<"tree" | "table" | "locations">(
    "tree",
  )
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OrganizationUnit | null>(null)
  const [pendingParent, setPendingParent] = React.useState<{
    id: string | null
    type?: OrganizationUnitType
  } | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<OrganizationUnit | null>(
    null,
  )

  // Refresh both data sources after any mutation.
  const refreshAll = React.useCallback(async () => {
    await Promise.all([refreshUnits(), refreshTree()])
  }, [refreshUnits, refreshTree])

  const filteredTree = React.useMemo(
    () => filterTree(tree, filters),
    [tree, filters],
  )
  const filteredUnits = React.useMemo(
    () => filterUnits(units, filters),
    [units, filters],
  )
  const filteredVendors = React.useMemo(
    () => filterVendors(landscapeItems, filters),
    [landscapeItems, filters],
  )

  const selectedNode = selectedId ? findTreeNode(tree, selectedId) : null

  function openCreate(parentId: string | null, parentType?: OrganizationUnitType) {
    setEditing(null)
    setPendingParent({ id: parentId, type: parentType })
    setEditDialogOpen(true)
  }

  function openEdit(id: string) {
    const unit = units.find((u) => u.id === id)
    if (!unit) {
      toast.error("Einheit konnte nicht geladen werden — bitte aktualisieren.")
      return
    }
    setEditing(unit)
    setPendingParent(null)
    setEditDialogOpen(true)
  }

  function openDelete(id: string) {
    const unit = units.find((u) => u.id === id)
    if (!unit) return
    setDeleteTarget(unit)
    setDeleteOpen(true)
  }

  async function handleCreate(body: Parameters<typeof create>[0]) {
    await create(body)
    await refreshTree()
  }

  async function handleUpdate(id: string, body: Parameters<typeof patch>[1]) {
    await patch(id, body)
    await refreshTree()
  }

  async function handleMove(id: string, newParentId: string | null) {
    const unit = units.find((u) => u.id === id)
    if (!unit) {
      throw new Error("Quell-Einheit nicht gefunden — bitte aktualisieren.")
    }
    await move(id, {
      new_parent_id: newParentId,
      expected_updated_at: unit.updated_at,
    })
    await refreshTree()
  }

  async function handleDelete(id: string) {
    await remove(id)
    if (selectedId === id) setSelectedId(null)
    await refreshTree()
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organisation
          </h1>
          <p className="text-sm text-muted-foreground">
            Pflege die Organisationsstruktur deines Tenants — Gesellschaften,
            Standorte, Bereiche, Abteilungen und Teams. Stakeholder, Ressourcen
            und Mitglieder können später diesen Einheiten zugeordnet werden.
          </p>
        </div>
        {canEdit ? (
          <Button variant="outline" asChild>
            <Link href="/stammdaten/organisation/import">
              <Upload className="mr-2 h-4 w-4" aria-hidden />
              CSV Import
            </Link>
          </Button>
        ) : null}
      </header>

      {(unitsError || treeError) && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">
              Daten konnten nicht geladen werden
            </CardTitle>
            <CardDescription>
              {unitsError ?? treeError}. Falls die Backend-Slice (PROJ-62-API)
              noch nicht gelandet ist, ist das erwartet — die UI ist
              eigenständig deploybar.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="tree">Tree-View</TabsTrigger>
          <TabsTrigger value="table">Tabelle</TabsTrigger>
          <TabsTrigger value="locations">Standorte</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="space-y-4">
          <OrgFilterToolbar
            filters={filters}
            onChange={setFilters}
            locations={locations}
            visibleCount={
              filteredTree.reduce(function count(
                acc: number,
                n: OrganizationUnitTreeNode,
              ): number {
                return n.children.reduce(count, acc + 1)
              }, 0)
            }
            totalCount={units.length}
          />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <OrgTree
              tree={filteredTree}
              flatUnits={units}
              locations={locations}
              loading={treeLoading || unitsLoading}
              canEdit={canEdit}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreateChild={openCreate}
              onEdit={openEdit}
              onDelete={openDelete}
              onMove={handleMove}
              vendorRows={filters.showVendors ? filteredVendors : []}
            />
            <div className="lg:sticky lg:top-4 lg:self-start">
              {selectedNode ? (
                <OrgDetailPanel
                  node={selectedNode}
                  allUnits={units}
                  locations={locations}
                  canEdit={canEdit}
                  onClose={() => setSelectedId(null)}
                  onEdit={(unit) => openEdit(unit.id)}
                  onDelete={(unit) => openDelete(unit.id)}
                />
              ) : (
                <Card className="hidden lg:block">
                  <CardHeader>
                    <CardTitle className="text-sm">Kein Knoten gewählt</CardTitle>
                    <CardDescription>
                      Klicke auf eine Einheit im Tree, um Details, Mitglieder
                      und Aktionen zu sehen.
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}
              {filters.showVendors && landscapeLoading ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Vendor-Sicht wird geladen…
                </p>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="table" className="space-y-4">
          <OrgFilterToolbar
            filters={filters}
            onChange={setFilters}
            locations={locations}
            vendorsToggleAvailable={false}
            visibleCount={filteredUnits.length}
            totalCount={units.length}
          />
          <OrgTable
            units={filteredUnits}
            locations={locations}
            loading={unitsLoading}
            canEdit={canEdit}
            onCreate={() => openCreate(null)}
            onEdit={openEdit}
            onDelete={openDelete}
          />
        </TabsContent>

        <TabsContent value="locations">
          <LocationTable canEdit={canEdit} />
        </TabsContent>
      </Tabs>

      <OrgEditDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setEditing(null)
            setPendingParent(null)
          }
        }}
        editing={editing}
        defaultParentId={pendingParent?.id ?? null}
        defaultType={pendingParent?.type}
        allUnits={units}
        locations={locations}
        onCreate={async (body) => {
          await handleCreate(body)
        }}
        onUpdate={async (id, body) => {
          await handleUpdate(id, body)
        }}
      />

      <OrgDeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteTarget(null)
        }}
        unit={deleteTarget}
        onConfirm={async (id) => {
          await handleDelete(id)
          await refreshAll()
        }}
      />

      {locationsLoading ? (
        <span className="sr-only">Standorte werden geladen…</span>
      ) : null}
    </div>
  )
}
