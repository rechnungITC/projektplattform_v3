"use client"

import { ChevronRight } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { WorkItemWithProfile } from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"
import { WorkItemStatusBadge } from "./work-item-status-badge"

interface BacklogTreeProps {
  items: WorkItemWithProfile[]
  loading: boolean
  onSelect: (id: string) => void
}

interface TreeNode {
  item: WorkItemWithProfile
  children: TreeNode[]
}

/**
 * Renders work items as a tree (parent_id chain).
 *
 * Items whose parent is filtered out (or absent) are surfaced at the top
 * level so they remain visible — orphan-friendly per Tech Design § F.
 */
export function BacklogTree({ items, loading, onSelect }: BacklogTreeProps) {
  const tree = React.useMemo(() => buildTree(items), [items])

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

  if (tree.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Keine Work Items für diese Filter.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="rounded-md border bg-card p-2">
      <ul role="tree" className="space-y-1">
        {tree.map((node) => (
          <TreeNodeRow
            key={node.item.id}
            node={node}
            depth={0}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  )
}

interface TreeNodeRowProps {
  node: TreeNode
  depth: number
  onSelect: (id: string) => void
}

function TreeNodeRow({ node, depth, onSelect }: TreeNodeRowProps) {
  const [expanded, setExpanded] = React.useState(true)
  const hasChildren = node.children.length > 0

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent",
          depth > 0 && "border-l border-dashed"
        )}
        style={{ marginLeft: depth * 16 }}
      >
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label={expanded ? "Einklappen" : "Ausklappen"}
            onClick={() => setExpanded((prev) => !prev)}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-90"
              )}
              aria-hidden
            />
          </Button>
        ) : (
          <span className="ml-1 inline-block h-4 w-4 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.item.id)}
          className="flex flex-1 items-center gap-2 text-left text-sm"
        >
          <WorkItemKindBadge kind={node.item.kind} />
          <span className="flex-1 truncate font-medium">
            {node.item.title}
          </span>
          <WorkItemStatusBadge status={node.item.status} />
        </button>
      </div>
      {hasChildren && expanded ? (
        <ul role="group" className="space-y-1">
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.item.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * Builds a forest from a flat list. Items whose `parent_id` is set but
 * not present in the list are promoted to top-level (orphan-safe).
 */
function buildTree(items: WorkItemWithProfile[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const item of items) {
    byId.set(item.id, { item, children: [] })
  }

  const roots: TreeNode[] = []
  for (const item of items) {
    const node = byId.get(item.id)
    if (!node) continue
    if (item.parent_id && byId.has(item.parent_id)) {
      byId.get(item.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}
