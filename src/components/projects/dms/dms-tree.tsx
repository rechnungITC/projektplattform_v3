"use client"

/**
 * PROJ-79-α — react-arborist document tree for the Dokumente tab.
 *
 * Pattern lifted from org-tree.tsx: flat→forest already done upstream
 * (useDocumentTree), virtualized rows, inline DnD move via `onMove`, and a
 * per-row dropdown for rename / delete / new-folder / download. Dropping
 * onto a document (leaf) is disabled; the backend RPC is the authority for
 * cycle prevention (→ 409, surfaced as a toast by the caller).
 */

import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import * as React from "react"
import { type NodeApi, Tree } from "react-arborist"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfidentialityBadge } from "@/components/projects/ma/confidentiality-badge"
import { cn } from "@/lib/utils"
import type { TreeForestNode } from "@/types/dms"

const ROW_HEIGHT = 36
const TREE_INDENT = 18

function MimeIcon({ mime }: { mime: string | undefined }) {
  const cls = "h-4 w-4 text-muted-foreground"
  if (!mime) return <FileIcon className={cls} aria-hidden />
  if (mime === "application/pdf") return <FileText className={cn(cls, "text-red-500")} aria-hidden />
  if (mime.startsWith("image/")) return <FileImage className={cn(cls, "text-violet-500")} aria-hidden />
  if (mime.includes("spreadsheet") || mime === "text/csv")
    return <FileSpreadsheet className={cn(cls, "text-emerald-600")} aria-hidden />
  return <FileText className={cls} aria-hidden />
}

export interface DmsTreeProps {
  forest: TreeForestNode[]
  loading: boolean
  canEdit: boolean
  selectedId: string | null
  height?: number
  onSelect: (id: string | null) => void
  onCreateChild: (parentId: string) => void
  onRename: (node: TreeForestNode) => void
  onReclassify: (node: TreeForestNode) => void
  onDelete: (node: TreeForestNode) => void
  onDownload: (node: TreeForestNode) => void
  onMove: (nodeId: string, newParentId: string | null) => void | Promise<void>
}

interface NodeRendererProps {
  node: NodeApi<TreeForestNode>
  style: React.CSSProperties
  dragHandle?: (el: HTMLDivElement | null) => void
  canEdit: boolean
  onCreateChild: (parentId: string) => void
  onRename: (node: TreeForestNode) => void
  onReclassify: (node: TreeForestNode) => void
  onDelete: (node: TreeForestNode) => void
  onDownload: (node: TreeForestNode) => void
}

function NodeRenderer({
  node,
  style,
  dragHandle,
  canEdit,
  onCreateChild,
  onRename,
  onReclassify,
  onDelete,
  onDownload,
}: NodeRendererProps) {
  const data = node.data
  const isFolder = data.node_type === "folder"

  return (
    <div
      ref={dragHandle}
      style={style}
      className={cn(
        "group flex h-full items-center gap-1.5 rounded-md pr-1 text-sm",
        node.isSelected ? "bg-accent" : "hover:bg-accent/50",
      )}
      onClick={() => node.select()}
    >
      {isFolder ? (
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation()
            node.toggle()
          }}
          aria-label={node.isOpen ? "Zuklappen" : "Aufklappen"}
        >
          {node.isOpen ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
        </button>
      ) : (
        <span className="h-5 w-5 shrink-0" />
      )}

      {isFolder ? (
        node.isOpen ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-sky-500" aria-hidden />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-sky-500" aria-hidden />
        )
      ) : (
        <MimeIcon mime={data.document?.mime_type} />
      )}

      <span className="truncate">{data.name}</span>

      {/* PROJ-Y-115c: classification is inherited down the tree, so showing it
          on every non-standard row makes the boundary visible where people
          actually work. `standard` stays unbadged to keep the tree calm. */}
      <ConfidentialityBadge
        level={data.confidentiality_level}
        hideStandard
        className="ml-1 px-1.5 py-0 text-[10px] leading-4"
      />

      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label="Aktionen"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {isFolder ? (
              <DropdownMenuItem onSelect={() => onCreateChild(data.id)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden /> Neuer Ordner
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onDownload(data)}>
                <Download className="mr-2 h-4 w-4" aria-hidden /> Herunterladen
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onRename(data)}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden /> Umbenennen
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReclassify(data)}>
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />{" "}
              Vertraulichkeit ändern
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(data)}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : !isFolder ? (
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onDownload(data)
          }}
          aria-label="Herunterladen"
        >
          <Download className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

export function DmsTree({
  forest,
  loading,
  canEdit,
  selectedId,
  height = 560,
  onSelect,
  onCreateChild,
  onRename,
  onReclassify,
  onDelete,
  onDownload,
  onMove,
}: DmsTreeProps) {
  if (loading) {
    return (
      <p className="px-2 py-6 text-sm text-muted-foreground">Lädt Dokumente…</p>
    )
  }
  if (forest.length === 0) {
    return (
      <p className="px-2 py-6 text-sm text-muted-foreground">
        Noch keine Dokumente oder Ordner.
      </p>
    )
  }

  return (
    <Tree<TreeForestNode>
      data={forest}
      openByDefault={false}
      rowHeight={ROW_HEIGHT}
      indent={TREE_INDENT}
      height={height}
      width="100%"
      selection={selectedId ?? undefined}
      disableDrag={!canEdit}
      disableDrop={({ parentNode }) =>
        // Only folders can be drop targets. `parentNode` is null at root
        // (allowed → move to root).
        parentNode != null && parentNode.data.node_type !== "folder"
      }
      onSelect={(nodes) => onSelect(nodes[0]?.id ?? null)}
      onMove={({ dragIds, parentId }) => {
        for (const id of dragIds) void onMove(id, parentId)
      }}
    >
      {(props) => (
        <NodeRenderer
          {...props}
          canEdit={canEdit}
          onCreateChild={onCreateChild}
          onRename={onRename}
          onReclassify={onReclassify}
          onDelete={onDelete}
          onDownload={onDownload}
        />
      )}
    </Tree>
  )
}
