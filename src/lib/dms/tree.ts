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

/** Ein Knoten des flachen Baums mit seinem lesbaren Pfad. */
export interface NodePathOption {
  id: string
  /** `Ordner / Unterordner / Name` */
  label: string
  isFolder: boolean
}

/**
 * PROJ-Y-45g — flache Knotenliste mit Pfad-Beschriftung, für Auswahllisten.
 *
 * Es gibt zwei Verbraucher: die Wissensquellen der Skills (PROJ-77-γ) und den
 * Beleg-Picker der Bau-Abnahmen. Die Logik steht deshalb **einmal** hier statt
 * zweimal in den Komponenten — dieselbe Entscheidung wie D-δ4 für das
 * Vorbehalts-Prädikat, und die Gegenrichtung zu PROJ-Y-45k, wo eine
 * Escaping-Hilfe inzwischen in sieben Kopien existiert.
 *
 * `guard` bricht Zyklen ab: der Datenbank-Wächter verhindert sie, aber eine
 * teilweise geladene Liste kann einen Knoten enthalten, dessen Vorfahr fehlt —
 * dann endet der Pfad an der Lücke statt in einer Endlosschleife.
 */
export function nodePathOptions(
  nodes: readonly TreeNodeWithDocument[],
): NodePathOption[] {
  const byId = new Map<string, TreeNodeWithDocument>()
  for (const n of nodes) byId.set(n.id, n)

  const pathOf = (node: TreeNodeWithDocument): string => {
    const parts: string[] = []
    let cur: TreeNodeWithDocument | undefined = node
    const guard = new Set<string>()
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id)
      parts.unshift(cur.name)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return parts.join(" / ")
  }

  return nodes
    .map((n) => ({
      id: n.id,
      label: pathOf(n),
      isFolder: n.node_type === "folder",
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
