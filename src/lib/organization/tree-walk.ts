/**
 * PROJ-62 — Pure tree-walk helpers for `organization_units`.
 *
 * Mirrors the DB-side cycle-detection logic so the frontend can:
 *   - reject obviously invalid drag-and-drop moves before hitting the API
 *   - compute breadcrumb paths for the combobox + detail panel
 *   - find descendants for delete-confirmation dependency lists
 *
 * Pure / no side effects. Side-effecting operations (network, state)
 * live in the hooks.
 */

export interface MinimalOrgUnit {
  id: string
  parent_id: string | null
  name: string
}

/** Build a parent-id → children index from a flat list. */
export function indexByParent<T extends MinimalOrgUnit>(
  units: ReadonlyArray<T>,
): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>()
  for (const u of units) {
    const arr = map.get(u.parent_id) ?? []
    arr.push(u)
    map.set(u.parent_id, arr)
  }
  return map
}

/** Build an id → unit lookup. */
export function indexById<T extends MinimalOrgUnit>(
  units: ReadonlyArray<T>,
): Map<string, T> {
  const map = new Map<string, T>()
  for (const u of units) map.set(u.id, u)
  return map
}

/**
 * Returns true when moving `unitId` under `newParentId` would create a
 * cycle — i.e. when `newParentId` is `unitId` itself or a descendant
 * of `unitId`. Walks the tree breadth-first, capped at 1000 nodes to
 * stay safe on pathological data.
 *
 * `newParentId === null` always returns false (moving to root cannot
 * create a cycle).
 */
export function wouldCreateCycle(
  unitId: string,
  newParentId: string | null,
  units: ReadonlyArray<MinimalOrgUnit>,
): boolean {
  if (newParentId === null) return false
  if (newParentId === unitId) return true
  const childrenOf = indexByParent(units)
  const queue: string[] = [unitId]
  let visited = 0
  while (queue.length > 0 && visited < 1000) {
    const current = queue.shift()!
    visited += 1
    const children = childrenOf.get(current) ?? []
    for (const c of children) {
      if (c.id === newParentId) return true
      queue.push(c.id)
    }
  }
  return false
}

/** All descendants of `unitId` (depth-first, excluding the unit itself). */
export function collectDescendants<T extends MinimalOrgUnit>(
  unitId: string,
  units: ReadonlyArray<T>,
): T[] {
  const childrenOf = indexByParent(units)
  const out: T[] = []
  const stack: string[] = [unitId]
  while (stack.length > 0) {
    const current = stack.pop()!
    const children = childrenOf.get(current) ?? []
    for (const c of children) {
      out.push(c)
      stack.push(c.id)
    }
  }
  return out
}

/**
 * Build a breadcrumb path (root-first) for `unitId`. Returns an array
 * of names: ["Beispiel GmbH", "Hamburg", "IT", "CRM Team"].
 * Walks parent-pointers; returns an empty array if `unitId` is unknown.
 */
export function breadcrumbPath<T extends MinimalOrgUnit>(
  unitId: string,
  units: ReadonlyArray<T>,
): string[] {
  const byId = indexById(units)
  const out: string[] = []
  let current = byId.get(unitId)
  let guard = 0
  while (current && guard < 100) {
    out.unshift(current.name)
    if (!current.parent_id) break
    current = byId.get(current.parent_id)
    guard += 1
  }
  return out
}

/**
 * Hard-cap depth for any node in the tree. Mirrors the DB-side CTE
 * depth-cap of 12. Returns the max-depth observed.
 */
export function maxDepth<T extends MinimalOrgUnit>(
  units: ReadonlyArray<T>,
): number {
  if (units.length === 0) return 0
  const byId = indexById(units)
  let max = 0
  for (const u of units) {
    let depth = 0
    let current: MinimalOrgUnit | undefined = u
    let guard = 0
    while (current?.parent_id && guard < 100) {
      current = byId.get(current.parent_id)
      depth += 1
      guard += 1
    }
    if (depth > max) max = depth
  }
  return max
}