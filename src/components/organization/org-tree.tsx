"use client"

/**
 * PROJ-62 — react-arborist tree-view for organization_units.
 *
 * Pattern lifted from PROJ-36 `backlog-tree.tsx`:
 *   - flat list → forest via parent_id
 *   - virtualized rendering (handled by react-arborist)
 *   - inline DnD via tree.onMove
 *   - pre-API cycle-detection in tree-walk.wouldCreateCycle
 *
 * Vendor-rows from the read-only landscape view appear as a virtual
 * "Externe Lieferanten" subtree at the bottom; they are not draggable,
 * not editable, and have a distinct visual treatment.
 */

import {
  Building,
  Building2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  Users,
} from "lucide-react"
import * as React from "react"
import { type NodeApi, Tree, type TreeApi } from "react-arborist"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { wouldCreateCycle } from "@/lib/organization/tree-walk"
import { cn } from "@/lib/utils"
import {
  ORGANIZATION_UNIT_TYPE_LABELS,
  type Location,
  type OrganizationLandscapeItem,
  type OrganizationUnit,
  type OrganizationUnitTreeNode,
  type OrganizationUnitType,
} from "@/types/organization"

interface OrgTreeProps {
  tree: OrganizationUnitTreeNode[]
  flatUnits: OrganizationUnit[]
  locations: Location[]
  loading: boolean
  canEdit: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onCreateChild: (parentId: string | null, parentType?: OrganizationUnitType) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string, newParentId: string | null) => Promise<void>
  /** Vendor rows — only shown when vendors-toggle is on. */
  vendorRows?: OrganizationLandscapeItem[]
}

interface TreeRow {
  id: string
  /** Display name. */
  name: string
  /** Unit type for display + filter. Vendors carry null. */
  type: OrganizationUnitType | null
  code: string | null
  locationId: string | null
  isActive: boolean
  isVendor: boolean
  isVendorGroup: boolean
  counts?: OrganizationUnitTreeNode["counts"]
  children: TreeRow[] | null
}

const VENDOR_GROUP_ID = "__vendor_group__"
const ROW_HEIGHT = 38
const TREE_INDENT = 20
const DEFAULT_TREE_HEIGHT = 600

function nodeToRow(node: OrganizationUnitTreeNode): TreeRow {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    code: node.code,
    locationId: node.location_id,
    isActive: node.is_active,
    isVendor: false,
    isVendorGroup: false,
    counts: node.counts,
    children: node.children.length > 0 ? node.children.map(nodeToRow) : null,
  }
}

function vendorRowsToTree(rows: OrganizationLandscapeItem[]): TreeRow | null {
  if (rows.length === 0) return null
  return {
    id: VENDOR_GROUP_ID,
    name: "Externe Lieferanten",
    type: null,
    code: null,
    locationId: null,
    isActive: true,
    isVendor: false,
    isVendorGroup: true,
    children: rows.map((r) => ({
      id: `vendor-${r.id}`,
      name: r.name,
      type: null,
      code: null,
      locationId: r.location_id,
      isActive: true,
      isVendor: true,
      isVendorGroup: false,
      children: null,
    })),
  }
}

function TypeIcon({
  type,
  isVendor,
}: {
  type: OrganizationUnitType | null
  isVendor: boolean
}) {
  if (isVendor) {
    return <Building className="h-3.5 w-3.5 text-amber-600" aria-hidden />
  }
  switch (type) {
    case "team":
      return <Users className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
    case "external_org":
      return <Building className="h-3.5 w-3.5 text-amber-600" aria-hidden />
    default:
      return <Building2 className="h-3.5 w-3.5 text-sky-600" aria-hidden />
  }
}

interface NodeRendererProps {
  node: NodeApi<TreeRow>
  style: React.CSSProperties
  dragHandle?: (el: HTMLDivElement | null) => void
  canEdit: boolean
  locations: Location[]
  onCreateChild: (parentId: string | null, parentType?: OrganizationUnitType) => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onSelect: (id: string | null) => void
}

function NodeRenderer({
  node,
  style,
  dragHandle,
  canEdit,
  locations,
  onCreateChild,
  onEdit,
  onDelete,
  onSelect,
}: NodeRendererProps) {
  const data = node.data
  const isLeaf = !data.children || data.children.length === 0
  const location = data.locationId
    ? locations.find((l) => l.id === data.locationId)
    : null
  const draggable = canEdit && !data.isVendor && !data.isVendorGroup

  return (
    <div
      ref={draggable ? dragHandle : undefined}
      style={style}
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 text-sm",
        node.isSelected ? "bg-primary/10" : "hover:bg-muted/60",
        !data.isActive && "opacity-60",
        data.isVendor && "bg-amber-50/60 dark:bg-amber-950/20",
        data.isVendorGroup && "font-semibold",
      )}
      role="treeitem"
      aria-selected={node.isSelected}
      onClick={() => {
        if (data.isVendor || data.isVendorGroup) {
          onSelect(null)
          return
        }
        onSelect(data.id)
      }}
    >
      <button
        type="button"
        className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
        aria-label={node.isOpen ? "Einklappen" : "Aufklappen"}
        onClick={(e) => {
          e.stopPropagation()
          if (!isLeaf) node.toggle()
        }}
      >
        {!isLeaf ? (
          node.isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )
        ) : null}
      </button>

      <TypeIcon type={data.type} isVendor={data.isVendor} />

      <span className="truncate font-medium">{data.name}</span>

      {data.code ? (
        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
          {data.code}
        </Badge>
      ) : null}

      {data.type && !data.isVendorGroup ? (
        <span className="hidden text-[11px] text-muted-foreground md:inline">
          {ORGANIZATION_UNIT_TYPE_LABELS[data.type]}
        </span>
      ) : null}

      {location ? (
        <span className="hidden items-center gap-0.5 text-[11px] text-muted-foreground md:inline-flex">
          <MapPin className="h-3 w-3" aria-hidden />
          {location.name}
        </span>
      ) : null}

      {data.counts && data.counts.children > 0 ? (
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {data.counts.children}
        </Badge>
      ) : null}

      {data.counts ? (
        <span className="hidden text-[11px] text-muted-foreground lg:inline">
          {data.counts.stakeholders} SH · {data.counts.resources} Res
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {data.isVendor ? (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            Vendor
          </Badge>
        ) : null}
        {canEdit && !data.isVendor && !data.isVendorGroup ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => e.stopPropagation()}
                aria-label="Aktionen"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  onCreateChild(data.id, data.type ?? undefined)
                }
              >
                <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
                Untereinheit anlegen
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(data.id)}>
                Bearbeiten
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(data.id)}
                className="text-destructive focus:text-destructive"
              >
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  )
}

export function OrgTree({
  tree,
  flatUnits,
  locations,
  loading,
  canEdit,
  selectedId,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
  onMove,
  vendorRows = [],
}: OrgTreeProps) {
  const treeRef = React.useRef<TreeApi<TreeRow> | null>(null)

  const data = React.useMemo<TreeRow[]>(() => {
    const out = tree.map(nodeToRow)
    const vendorGroup = vendorRowsToTree(vendorRows)
    if (vendorGroup) out.push(vendorGroup)
    return out
  }, [tree, vendorRows])

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-12 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Noch keine Organisationsstruktur</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Lege eine Wurzel-Einheit (z.B. die Gesellschaft) an, oder importiere
          per CSV (PROJ-63 — kommt mit dem nächsten Slice).
        </p>
        {canEdit ? (
          <Button
            size="sm"
            className="mt-2"
            onClick={() => onCreateChild(null, "company")}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Erste Einheit anlegen
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => treeRef.current?.openAll()}
          >
            Alle aufklappen
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => treeRef.current?.closeAll()}
          >
            Alle einklappen
          </Button>
        </div>
        {canEdit ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCreateChild(null)}
          >
            <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
            Wurzel-Einheit
          </Button>
        ) : null}
      </div>

      <Tree<TreeRow>
        ref={treeRef}
        data={data}
        openByDefault={false}
        rowHeight={ROW_HEIGHT}
        indent={TREE_INDENT}
        height={DEFAULT_TREE_HEIGHT}
        width="100%"
        selection={selectedId ?? undefined}
        disableDrag={(node) =>
          !canEdit || node.isVendor || node.isVendorGroup
        }
        disableDrop={({ parentNode }) => {
          if (!parentNode) return false
          const parentData = parentNode.data
          // No dropping under vendor branches.
          return parentData.isVendor || parentData.isVendorGroup
        }}
        onMove={async ({ dragIds, parentId }) => {
          if (!canEdit) return
          const id = dragIds[0]
          if (!id) return
          // Strip the synthetic prefixes; flat units only carry plain ids.
          const targetParent =
            parentId === null || parentId === VENDOR_GROUP_ID ? null : parentId
          if (wouldCreateCycle(id, targetParent, flatUnits)) {
            toast.error(
              "Diese Verschiebung würde einen Kreis erzeugen — abgebrochen.",
            )
            return
          }
          try {
            await onMove(id, targetParent)
          } catch (err) {
            const e = err as Error & { code?: string }
            if (e.code === "cycle_detected") {
              toast.error(
                "Server hat den Move abgelehnt: Zyklus erkannt.",
              )
            } else {
              toast.error(e.message ?? "Verschieben fehlgeschlagen.")
            }
          }
        }}
      >
        {({ node, style, dragHandle }) => (
          <NodeRenderer
            node={node}
            style={style}
            dragHandle={dragHandle}
            canEdit={canEdit}
            locations={locations}
            onCreateChild={onCreateChild}
            onEdit={onEdit}
            onDelete={onDelete}
            onSelect={onSelect}
          />
        )}
      </Tree>
      {loading ? (
        <div className="flex items-center justify-center gap-2 border-t py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Aktualisiere…
        </div>
      ) : null}
    </div>
  )
}
