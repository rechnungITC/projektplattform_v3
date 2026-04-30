/**
 * PROJ-16 — server helpers for method-overrides.
 *
 * Methods are code-defined in METHOD_TEMPLATES (scrum, kanban, safe,
 * waterfall, pmi, prince2, vxt2). Per-tenant override layer is just a
 * boolean enable/disable per method. Default for a method without a
 * row is "enabled=true". The DB trigger enforces "min one method
 * enabled" race-safely.
 */

import type { MethodOverrideRow } from "@/types/master-data"
import type { ProjectMethod } from "@/types/project-method"

import { METHOD_TEMPLATES } from "./index"

export const VALID_METHOD_KEYS: readonly ProjectMethod[] = Object.keys(
  METHOD_TEMPLATES
) as ProjectMethod[]

export function isValidMethodKey(key: string): key is ProjectMethod {
  return (VALID_METHOD_KEYS as readonly string[]).includes(key)
}

/**
 * Resolve effective enabled-state for every known method, given the
 * stored overrides for a tenant. Used by the wizard / API to know which
 * methods to offer.
 */
export function resolveMethodAvailability(
  rows: readonly MethodOverrideRow[]
): Record<ProjectMethod, boolean> {
  const overrides = new Map<ProjectMethod, boolean>(
    rows.map((r) => [r.method_key, r.enabled])
  )
  const result = {} as Record<ProjectMethod, boolean>
  for (const k of VALID_METHOD_KEYS) {
    result[k] = overrides.get(k) ?? true
  }
  return result
}

/**
 * Counts how many methods would be enabled if `methodKey` were toggled
 * to `nextEnabled`. Used by the API layer for a fail-fast preview before
 * relying on the DB trigger.
 */
export function countEnabledAfterToggle(
  rows: readonly MethodOverrideRow[],
  methodKey: ProjectMethod,
  nextEnabled: boolean
): number {
  const map = new Map<ProjectMethod, boolean>(
    rows.map((r) => [r.method_key, r.enabled])
  )
  map.set(methodKey, nextEnabled)
  let n = 0
  for (const k of VALID_METHOD_KEYS) {
    if (map.get(k) ?? true) n++
  }
  return n
}
