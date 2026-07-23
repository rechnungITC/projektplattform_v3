/**
 * PROJ-79-α — pure forest builder for the DMS tree UI.
 *
 * The `?all=true` tree endpoint returns a flat list of every live node in a
 * project; the UI turns it into a forest for react-arborist (same
 * "flat list → forest via parent_id" pattern as org-tree/backlog-tree).
 *
 * Ordering: folders before documents, then alphabetical by name — applied at
 * every level (the API already orders, but re-sorting keeps the client
 * correct regardless of fetch order).
 */

import type { TreeForestNode, TreeNodeWithDocument } from "@/types/dms"

function sortNodes(a: TreeForestNode, b: TreeForestNode): number {
  // Folders (node_type 'folder') before documents.
  if (a.node_type !== b.node_type) {
    return a.node_type === "folder" ? -1 : 1
  }
  return a.name.localeCompare(b.name)
}

/**
 * Assemble a flat node list into a forest. Documents become leaves
 * (`children: null`); folders keep an array (expandable, possibly empty).
 * Nodes whose `parent_id` is missing from the set are treated as roots (so a
 * partial/filtered fetch still renders rather than dropping orphans).
 */
export function buildForest(
  nodes: TreeNodeWithDocument[],
): TreeForestNode[] {
  const byId = new Map<string, TreeForestNode>()
  for (const n of nodes) {
    byId.set(n.id, { ...n, children: n.node_type === "folder" ? [] : null })
  }

  const roots: TreeForestNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null
    if (parent && parent.children) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortRec = (list: TreeForestNode[]) => {
    list.sort(sortNodes)
    for (const n of list) if (n.children) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}
