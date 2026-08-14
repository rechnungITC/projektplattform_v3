"use client"

import * as React from "react"

import {
  ConstructionApiError,
  listConstructionSections,
  listConstructionTrades,
  listProjectTrades,
} from "@/lib/construction/api"
import type {
  ConstructionSection,
  ConstructionTrade,
  ProjectConstructionTrade,
} from "@/types/construction"

interface Result<T> {
  data: T
  loading: boolean
  /** True when the construction module is off for this workspace — a state, not a fault. */
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

function useCollection<T>(
  load: () => Promise<T>,
  empty: T,
  enabled: boolean
): Result<T> {
  const [data, setData] = React.useState<T>(empty)
  const [loading, setLoading] = React.useState(enabled)
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    // Nothing to fetch yet (no project id, or the module is known to be off).
    // No state is written here on purpose: the initial state already IS the
    // disabled state (`empty` data, `loading = enabled`), so writing it again
    // would only be a set-state-in-effect with no observable difference.
    if (!enabled) return

    let cancelled = false
    void (async () => {
      try {
        const rows = await load()
        if (cancelled) return
        setData(rows)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        // 404 with read intent = module off. Never surfaced as an error, and
        // never as an empty list either — that would claim "nothing there"
        // when we were not allowed to look (PROJ-64 AC-9 / PROJ-Y-143f).
        if (err instanceof ConstructionApiError && err.status === 404) {
          setModuleInactive(true)
          setData(empty)
        } else {
          setError(err instanceof Error ? err.message : "Unbekannter Fehler")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // `empty` is a module-level constant from the caller and `load` is
    // memoised there, so this effect re-runs only on a real input change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, load])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { data, loading, moduleInactive, error, refresh }
}

const NO_TRADES: ProjectConstructionTrade[] = []
const NO_SECTIONS: ConstructionSection[] = []
const NO_CATALOG: ConstructionTrade[] = []

export function useProjectTrades(projectId: string | null | undefined) {
  const load = React.useCallback(
    () => listProjectTrades(projectId as string),
    [projectId]
  )
  const r = useCollection(load, NO_TRADES, Boolean(projectId))
  return { trades: r.data, ...r }
}

export function useConstructionSections(projectId: string | null | undefined) {
  const load = React.useCallback(
    () => listConstructionSections(projectId as string),
    [projectId]
  )
  const r = useCollection(load, NO_SECTIONS, Boolean(projectId))
  return { sections: r.data, ...r }
}

/** The tenant catalog, for the "assign a trade" picker. */
export function useConstructionTradeCatalog(enabled = true) {
  const load = React.useCallback(() => listConstructionTrades(), [])
  const r = useCollection(load, NO_CATALOG, enabled)
  return { catalog: r.data, ...r }
}

export interface SectionTreeNode extends ConstructionSection {
  children: SectionTreeNode[]
  depth: number
}

/**
 * Turns the flat list into a tree. Kept pure and exported so the ordering rules
 * (sort_order, then label) are unit-testable without rendering anything.
 * Orphans — rows whose parent is not in the list — are surfaced at root level
 * rather than dropped, so nothing can silently disappear from the view.
 */
export function buildSectionTree(
  sections: readonly ConstructionSection[]
): SectionTreeNode[] {
  const byId = new Map<string, SectionTreeNode>()
  for (const s of sections) byId.set(s.id, { ...s, children: [], depth: 0 })

  const roots: SectionTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (nodes: SectionTreeNode[], depth: number) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "de"))
    for (const n of nodes) {
      n.depth = depth
      sortRec(n.children, depth + 1)
    }
  }
  sortRec(roots, 0)
  return roots
}

/** Flattens the tree for rendering as an indented list. */
export function flattenSectionTree(nodes: SectionTreeNode[]): SectionTreeNode[] {
  const out: SectionTreeNode[] = []
  const walk = (list: SectionTreeNode[]) => {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/**
 * Ids that may NOT be chosen as a new parent for `sectionId`: itself and its
 * descendants. The database rejects a cycle anyway; this keeps the picker from
 * offering a choice that can only fail.
 */
export function forbiddenParentIds(
  sections: readonly ConstructionSection[],
  sectionId: string
): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const s of sections) {
    if (!s.parent_id) continue
    const list = childrenOf.get(s.parent_id) ?? []
    list.push(s.id)
    childrenOf.set(s.parent_id, list)
  }
  const blocked = new Set<string>([sectionId])
  const stack = [sectionId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const child of childrenOf.get(current) ?? []) {
      if (!blocked.has(child)) {
        blocked.add(child)
        stack.push(child)
      }
    }
  }
  return blocked
}
