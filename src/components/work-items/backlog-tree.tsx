"use client"

import {
  AlertTriangle,
  ChevronRight,
  IndentDecrease,
  IndentIncrease,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Pilcrow,
} from "lucide-react"
import * as React from "react"
import { NodeApi, Tree, type TreeApi } from "react-arborist"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  formatDateShort,
  formatHours,
  outlinePathDepth,
  ownEstimateHours,
  ownPlannedEnd,
  ownPlannedStart,
  totalEffort,
} from "@/lib/work-items/wbs-display"
import {
  ALLOWED_PARENT_KINDS,
  type WorkItemKind,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { EditWbsCodeDialog } from "./edit-wbs-code-dialog"
import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemStatusBadge } from "./work-item-status-badge"

interface BacklogTreeProps {
  projectId: string
  items: WorkItemWithProfile[]
  loading: boolean
  onSelect: (id: string) => void
  /**
   * Row-action callbacks (parity with BacklogList's 3-dots menu).
   * Without these, the tree-view has only inline title + WBS-code edit
   * and users have no obvious way to change status, priority,
   * responsible, sprint, parent, or delete.
   */
  onEditRequest?: (item: WorkItemWithProfile) => void
  onChangeStatusRequest?: (item: WorkItemWithProfile) => void
  onChangeParentRequest?: (item: WorkItemWithProfile) => void
  onDeleteRequest?: (item: WorkItemWithProfile) => void
  /** Re-fetch list after a mutation (parent_id change, wbs_code change). */
  onChanged?: () => void | Promise<void>
}

interface TreeNode {
  id: string
  item: WorkItemWithProfile
  /** Mutated by buildForest — children are this item's direct descendants. */
  children: TreeNode[] | null
}

const ROW_HEIGHT = 44
const TREE_INDENT = 20
const DEFAULT_TREE_HEIGHT = 600
const DEPTH_WARNING_THRESHOLD = 10

/**
 * PROJ-36 Phase 36-γ — hierarchical Tree-View for the Backlog.
 *
 * Replaces the previous parent_id hand-rolled tree with `react-arborist`
 * (MIT, ~30 KB gzip, virtualized + A11y + keyboard nav out of the box).
 *
 * Rendering rules per spec § E + § C:
 *   - Columns: WBS-Code · Name · Kind · Eigenes/Roll-up Datum · Eigener/Roll-up
 *     Aufwand · Gesamt · Status.
 *   - Hybrid roll-up: own and derived shown side-by-side (no aggregation in
 *     dates), Effort additionally shows "Gesamt = own + derived".
 *   - Indent / Outdent change parent_id via PATCH; gated by ALLOWED_PARENT_KINDS.
 *   - Depth warning when outline_path > 10 levels deep.
 *   - Inline-Edit on title via react-arborist's rename API (Enter to commit).
 *   - WBS-Code edit opens a dialog (regex + reset-to-auto handled there).
 */
export function BacklogTree({
  projectId,
  items,
  loading,
  onSelect,
  onEditRequest,
  onChangeStatusRequest,
  onChangeParentRequest,
  onDeleteRequest,
  onChanged,
}: BacklogTreeProps) {
  const treeRef = React.useRef<TreeApi<TreeNode> | undefined>(undefined)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [pendingMoveId, setPendingMoveId] = React.useState<string | null>(null)
  const [editingWbsItem, setEditingWbsItem] =
    React.useState<WorkItemWithProfile | null>(null)
  const [containerRef, setContainerRef] =
    React.useState<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = React.useState<number>(0)

  // Track container width so the virtualized tree can fill it.
  React.useEffect(() => {
    if (!containerRef) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) setContainerWidth(width)
    })
    observer.observe(containerRef)
    return () => observer.disconnect()
  }, [containerRef])

  const itemsById = React.useMemo(() => {
    const map = new Map<string, WorkItemWithProfile>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  const forest = React.useMemo(() => buildForest(items), [items])

  // Compute deepest path for the warning banner.
  const maxDepth = React.useMemo(() => {
    let max = 0
    for (const it of items) {
      const d = outlinePathDepth(it.outline_path ?? null)
      if (d > max) max = d
    }
    return max
  }, [items])

  // Move targets are computed from the live react-arborist NodeApi —
  // the tree owns parent/sibling relationships via NodeApi getters.
  // react-arborist exposes its node graph imperatively via treeRef; this
  // is the recommended consumption pattern (see react-arborist docs).
  const selectedNode = selectedId
    // eslint-disable-next-line react-hooks/refs
    ? treeRef.current?.visibleNodes.find((n) => n.id === selectedId) ?? null
    : null

  const indentTargetNode = selectedNode
    ? getPreviousSibling(selectedNode)
    : null

  const indentParentKind: WorkItemKind | null =
    indentTargetNode?.data.item.kind ?? null
  const outdentParentKind: WorkItemKind | null = selectedNode
    ? selectedNode.parent?.parent?.data.item.kind ?? null
    : null

  const selectedKind = selectedNode?.data.item.kind ?? null

  const canIndent =
    !!selectedNode &&
    !!indentTargetNode &&
    selectedKind != null &&
    isAllowedParent(selectedKind, indentParentKind) &&
    pendingMoveId !== selectedId

  // Outdent only valid if the selected node has a parent (not already top-level).
  const canOutdent =
    !!selectedNode &&
    selectedNode.level > 0 &&
    selectedKind != null &&
    isAllowedParent(selectedKind, outdentParentKind) &&
    pendingMoveId !== selectedId

  const handleExpandAll = () => treeRef.current?.openAll()
  const handleCollapseAll = () => treeRef.current?.closeAll()

  const moveParent = async (
    childId: string,
    newParentId: string | null
  ): Promise<void> => {
    setPendingMoveId(childId)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${childId}/parent`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent_id: newParentId }),
        }
      )
      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Verschieben fehlgeschlagen", { description: message })
        return
      }
      toast.success("Hierarchie aktualisiert")
      await onChanged?.()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Verschieben fehlgeschlagen", { description: message })
    } finally {
      setPendingMoveId(null)
    }
  }

  const handleIndent = async () => {
    if (!canIndent || !selectedNode || !indentTargetNode) return
    await moveParent(selectedNode.id, indentTargetNode.id)
  }

  const handleOutdent = async () => {
    if (!canOutdent || !selectedNode) return
    // Outdent: new parent = current parent's parent (grandparent).
    // If grandparent is null (root), the node moves to top-level.
    const newParentId = selectedNode.parent?.parent?.id ?? null
    // react-arborist exposes a synthetic "__REACT_ARBORIST_INTERNAL_ROOT__"
    // for the implicit root; treat that as null.
    const realParentId =
      newParentId && newParentId.startsWith("__")
        ? null
        : newParentId
    await moveParent(selectedNode.id, realParentId)
  }

  const handleRename = async ({
    id,
    name,
  }: {
    id: string
    name: string
  }): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Titel darf nicht leer sein")
      return
    }
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        }
      )
      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Titel konnte nicht gespeichert werden", {
          description: message,
        })
        return
      }
      toast.success("Titel aktualisiert")
      await onChanged?.()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Titel konnte nicht gespeichert werden", {
        description: message,
      })
    }
  }

  // Avoid unused-var lint warnings in case future render paths reference these.
  void itemsById

  if (loading) {
    return (
      <div role="status" aria-label="Lädt Work Items" className="space-y-2">
        {Array.from({ length: 3 }).map((_, idx) => (
          <Card key={idx}>
            <CardContent className="space-y-2 p-3">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="ml-6 h-4 w-1/2" />
              <Skeleton className="ml-6 h-4 w-1/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (forest.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Keine Work Items für diese Filter.
        </CardContent>
      </Card>
    )
  }

  const selectedTitle = selectedNode?.data.item.title ?? null

  return (
    <div className="space-y-3">
      {maxDepth > DEPTH_WARNING_THRESHOLD ? (
        <Alert role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertDescription>
            Diese WBS hat eine Tiefe von {maxDepth} Ebenen. Erwäge eine
            strukturelle Vereinfachung.
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 text-sm"
        role="toolbar"
        aria-label="Tree-Toolbar"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExpandAll}
        >
          Alle ausklappen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCollapseAll}
        >
          Alle einklappen
        </Button>
        <span className="mx-1 h-5 border-l" aria-hidden />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canIndent}
          onClick={handleIndent}
          aria-label="Tiefer einrücken (Indent)"
        >
          {pendingMoveId === selectedId ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <IndentIncrease className="mr-1 h-3.5 w-3.5" aria-hidden />
          )}
          Indent
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canOutdent}
          onClick={handleOutdent}
          aria-label="Höher rücken (Outdent)"
        >
          <IndentDecrease className="mr-1 h-3.5 w-3.5" aria-hidden />
          Outdent
        </Button>
        {selectedTitle ? (
          <span className="ml-2 truncate text-xs text-muted-foreground">
            Ausgewählt: {selectedTitle}
          </span>
        ) : (
          <span className="ml-2 text-xs text-muted-foreground">
            Wähle ein Item für Indent/Outdent
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        <TreeHeader />
        <div ref={setContainerRef} className="w-full">
          {containerWidth > 0 ? (
            <Tree<TreeNode>
              ref={treeRef}
              data={forest}
              openByDefault
              rowHeight={ROW_HEIGHT}
              indent={TREE_INDENT}
              width={containerWidth}
              height={Math.min(
                DEFAULT_TREE_HEIGHT,
                Math.max(items.length, 1) * ROW_HEIGHT + ROW_HEIGHT
              )}
              onSelect={(nodes) => {
                setSelectedId(nodes[0]?.id ?? null)
              }}
              onActivate={(node) => onSelect(node.id)}
              onRename={handleRename}
              disableMultiSelection
              disableDrag
              disableDrop
              idAccessor={(d) => d.id}
              childrenAccessor={(d) => d.children}
            >
              {(props) => (
                <BacklogTreeRow
                  {...props}
                  onSelectItem={onSelect}
                  onEditWbsCode={setEditingWbsItem}
                  onEditRequest={onEditRequest}
                  onChangeStatusRequest={onChangeStatusRequest}
                  onChangeParentRequest={onChangeParentRequest}
                  onDeleteRequest={onDeleteRequest}
                  pendingMoveId={pendingMoveId}
                />
              )}
            </Tree>
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden />
            </div>
          )}
        </div>
      </div>

      {editingWbsItem ? (
        <EditWbsCodeDialog
          open={!!editingWbsItem}
          onOpenChange={(open) => {
            if (!open) setEditingWbsItem(null)
          }}
          projectId={projectId}
          item={editingWbsItem}
          onSaved={async () => {
            await onChanged?.()
          }}
        />
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header — sticky column labels above the virtualized tree body
// ---------------------------------------------------------------------------

function TreeHeader() {
  return (
    <div
      role="row"
      className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/40 px-2 py-2 text-xs font-medium text-muted-foreground"
    >
      <div className="w-[28%] min-w-[260px] pl-1">Name</div>
      <div className="hidden w-[10%] sm:block">WBS-Code</div>
      <div className="hidden w-[10%] md:block">Eig. Datum</div>
      <div className="hidden w-[10%] md:block">Roll-up Datum</div>
      <div className="hidden w-[8%] text-right md:block">Eig. Aufwand</div>
      <div className="hidden w-[8%] text-right md:block">Roll-up</div>
      <div className="hidden w-[8%] text-right md:block">Gesamt</div>
      <div className="ml-auto w-[10%] text-right">Status</div>
      <div className="w-8" aria-hidden />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row renderer — one row per work-item in the tree
// ---------------------------------------------------------------------------

interface BacklogTreeRowProps {
  node: NodeApi<TreeNode>
  style: React.CSSProperties
  tree: TreeApi<TreeNode>
  onSelectItem: (id: string) => void
  onEditWbsCode: (item: WorkItemWithProfile) => void
  onEditRequest?: (item: WorkItemWithProfile) => void
  onChangeStatusRequest?: (item: WorkItemWithProfile) => void
  onChangeParentRequest?: (item: WorkItemWithProfile) => void
  onDeleteRequest?: (item: WorkItemWithProfile) => void
  pendingMoveId: string | null
}

function BacklogTreeRow({
  node,
  style,
  tree,
  onSelectItem,
  onEditWbsCode,
  onEditRequest,
  onChangeStatusRequest,
  onChangeParentRequest,
  onDeleteRequest,
  pendingMoveId,
}: BacklogTreeRowProps) {
  const item = node.data.item
  const hasChildren = !node.isLeaf
  const isPending = pendingMoveId === item.id
  const isSelected = node.isSelected

  const ownStart = ownPlannedStart(item)
  const ownEnd = ownPlannedEnd(item)
  const ownEffort = ownEstimateHours(item)

  const derivedStart = item.derived_planned_start ?? null
  const derivedEnd = item.derived_planned_end ?? null
  const derivedEffort = item.derived_estimate_hours ?? null

  const total = totalEffort(ownEffort, derivedEffort)

  const wbsCode = item.wbs_code ?? null
  const wbsCustom = item.wbs_code_is_custom === true

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? node.isOpen : undefined}
      style={style}
      className={cn(
        "group flex items-center gap-2 border-b px-2 text-sm",
        isSelected && "bg-accent",
        isPending && "opacity-60"
      )}
    >
      {/* Name column */}
      <div className="flex w-[28%] min-w-[260px] items-center gap-1 truncate pl-1">
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label={node.isOpen ? "Einklappen" : "Ausklappen"}
            onClick={(event) => {
              event.stopPropagation()
              node.toggle()
            }}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                node.isOpen && "rotate-90"
              )}
              aria-hidden
            />
          </Button>
        ) : (
          <span className="ml-1 inline-block h-4 w-4 shrink-0" aria-hidden />
        )}
        <WorkItemKindBadge kind={item.kind} iconOnly />
        {node.isEditing ? (
          <input
            autoFocus
            defaultValue={item.title}
            className="flex-1 rounded border bg-background px-1 py-0.5 text-sm"
            onBlur={(event) => node.submit(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") node.submit(event.currentTarget.value)
              if (event.key === "Escape") node.reset()
            }}
            aria-label={`Titel bearbeiten: ${item.title}`}
          />
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              tree.select(node.id)
              onSelectItem(item.id)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              node.edit()
            }}
            className="flex-1 truncate text-left font-medium hover:underline"
            title="Doppelklick: Titel bearbeiten"
          >
            {item.title}
          </button>
        )}
        {!node.isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            aria-label="Titel bearbeiten"
            onClick={(event) => {
              event.stopPropagation()
              node.edit()
            }}
          >
            <PencilLine className="h-3 w-3" aria-hidden />
          </Button>
        ) : null}
      </div>

      {/* WBS-Code */}
      <div className="hidden w-[10%] sm:block">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onEditWbsCode(item)
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs hover:bg-muted",
            wbsCustom
              ? "border border-dashed text-foreground"
              : "text-muted-foreground"
          )}
          title={
            wbsCustom
              ? "Manuell überschriebener Code — klicken zum Bearbeiten"
              : "Auto-generierter Code — klicken zum Bearbeiten"
          }
          aria-label={`WBS-Code ${wbsCode ?? "—"} bearbeiten`}
        >
          {wbsCustom ? <Pilcrow className="h-3 w-3" aria-hidden /> : null}
          <span>{wbsCode ?? "—"}</span>
          {wbsCustom ? (
            <span aria-hidden className="text-[10px]">
              •
            </span>
          ) : null}
        </button>
      </div>

      {/* Eigenes Datum — klickbar öffnet Edit-Dialog */}
      <div className="hidden w-[10%] text-xs md:block">
        {onEditRequest ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onEditRequest(item)
            }}
            className="rounded px-1 py-0.5 text-left hover:bg-muted"
            title="Eigenes Datum bearbeiten"
            aria-label="Eigenes Datum bearbeiten"
          >
            {ownStart || ownEnd ? (
              <span>
                {formatDateShort(ownStart)} – {formatDateShort(ownEnd)}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </button>
        ) : ownStart || ownEnd ? (
          <span>
            {formatDateShort(ownStart)} – {formatDateShort(ownEnd)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Roll-up Datum */}
      <div className="hidden w-[10%] text-xs text-muted-foreground md:block">
        {derivedStart || derivedEnd ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  {formatDateShort(derivedStart)} – {formatDateShort(derivedEnd)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Aus Kindern abgeleitet (Min/Max)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span>—</span>
        )}
      </div>

      {/* Eigener Aufwand — klickbar öffnet Edit-Dialog */}
      <div className="hidden w-[8%] text-right font-mono text-xs tabular-nums md:block">
        {onEditRequest ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onEditRequest(item)
            }}
            className="rounded px-1 py-0.5 hover:bg-muted"
            title="Eigenen Aufwand bearbeiten"
            aria-label="Eigenen Aufwand bearbeiten"
          >
            {formatHours(ownEffort)}
          </button>
        ) : (
          formatHours(ownEffort)
        )}
      </div>

      {/* Roll-up Aufwand */}
      <div className="hidden w-[8%] text-right font-mono text-xs tabular-nums text-muted-foreground md:block">
        {derivedEffort != null ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  {formatHours(derivedEffort)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Aus Kindern (Summe)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span>—</span>
        )}
      </div>

      {/* Gesamt */}
      <div className="hidden w-[8%] text-right font-mono text-xs font-semibold tabular-nums md:block">
        {total != null ? formatHours(total) : "—"}
      </div>

      {/* Status — klickbar öffnet Status-Dialog */}
      <div className="ml-auto w-[10%] text-right">
        {onChangeStatusRequest ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onChangeStatusRequest(item)
            }}
            className="rounded hover:opacity-80"
            title="Status ändern"
            aria-label={`Status ${item.status} ändern`}
          >
            <WorkItemStatusBadge status={item.status} />
          </button>
        ) : (
          <WorkItemStatusBadge status={item.status} />
        )}
      </div>

      {/* Actions menu — parity with BacklogList row dropdown */}
      <div className="w-8 text-right">
        {onEditRequest ||
        onChangeStatusRequest ||
        onChangeParentRequest ||
        onDeleteRequest ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Aktionen für „${item.title}"`}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48"
              onClick={(event) => event.stopPropagation()}
            >
              {onEditRequest ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    onEditRequest(item)
                  }}
                >
                  Bearbeiten
                </DropdownMenuItem>
              ) : null}
              {onChangeStatusRequest ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    onChangeStatusRequest(item)
                  }}
                >
                  Status ändern
                </DropdownMenuItem>
              ) : null}
              {onChangeParentRequest ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    onChangeParentRequest(item)
                  }}
                >
                  Übergeordnet ändern
                </DropdownMenuItem>
              ) : null}
              {onDeleteRequest ? (
                <>
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
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree-building helpers
// ---------------------------------------------------------------------------

/**
 * Build a forest from a flat list. Items whose parent_id points to an item
 * not in the list (filtered out / orphaned) are surfaced at the top level
 * — orphan-friendly per Tech Design § F.
 *
 * Children are sorted by `outline_path` (alphanumeric, ltree convention)
 * to keep the rendering stable and matching the DB.
 */
function buildForest(items: WorkItemWithProfile[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const item of items) {
    byId.set(item.id, { id: item.id, item, children: null })
  }

  const roots: TreeNode[] = []
  for (const item of items) {
    const node = byId.get(item.id)
    if (!node) continue
    if (item.parent_id && byId.has(item.parent_id)) {
      const parent = byId.get(item.parent_id)!
      if (!parent.children) parent.children = []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortRecursive = (nodes: TreeNode[] | null) => {
    if (!nodes) return
    nodes.sort((a, b) => {
      const ap = a.item.outline_path ?? ""
      const bp = b.item.outline_path ?? ""
      if (ap === bp)
        return (a.item.position ?? 0) - (b.item.position ?? 0)
      return ap < bp ? -1 : 1
    })
    for (const n of nodes) sortRecursive(n.children)
  }
  sortRecursive(roots)
  return roots
}

/**
 * Return the previous-sibling of a node — the indent target. Uses
 * `node.parent.children` (react-arborist NodeApi) so we always reflect
 * the current view including filtered-out items.
 */
function getPreviousSibling(node: NodeApi<TreeNode>): NodeApi<TreeNode> | null {
  const siblings = node.parent?.children ?? null
  if (!siblings) return null
  const idx = siblings.findIndex((n) => n.id === node.id)
  if (idx <= 0) return null
  return siblings[idx - 1]
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function isAllowedParent(
  childKind: WorkItemKind,
  parentKind: WorkItemKind | null
): boolean {
  return ALLOWED_PARENT_KINDS[childKind].includes(parentKind)
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string | { message?: string }
      message?: string
    }
    if (typeof data.error === "string") return data.error
    if (data.error && typeof data.error === "object") {
      return data.error.message ?? `Anfrage fehlgeschlagen (${response.status})`
    }
    return data.message ?? `Anfrage fehlgeschlagen (${response.status})`
  } catch {
    return `Anfrage fehlgeschlagen (${response.status})`
  }
}
