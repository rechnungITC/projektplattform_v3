/**
 * PROJ-12 — payload classification.
 *
 * `classifyRiskAutoContext` walks the curated allowlist auto-context and
 * returns the highest privacy class observed. The router uses the result
 * to decide whether external (cloud) routing is permitted.
 *
 * This runs as the second defense line over the auto-context allowlist:
 * the allowlist already excludes Class-3 fields by design, but if a
 * future change accidentally adds a Class-3 field to the auto-context
 * shape, the classifier still catches it and forces local routing.
 */

import { classifyField } from "./data-privacy-registry"
import type { DataClass, RiskAutoContext } from "./types"

function bumpMax(current: DataClass, candidate: DataClass): DataClass {
  return (Math.max(current, candidate) as DataClass)
}

function classifyRecord(
  table: string,
  record: Record<string, unknown>,
  tenantDefault: DataClass
): DataClass {
  let max: DataClass = 1
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue
    max = bumpMax(max, classifyField(table, key, tenantDefault))
    if (max === 3) return 3
  }
  return max
}

/**
 * `tenantDefault` (PROJ-17) is the fallback class for *unknown* fields.
 * Defaults to 3 (most conservative) when not provided. Known Class-3
 * fields always stay Class 3 regardless of the tenant default.
 */
export function classifyRiskAutoContext(
  ctx: RiskAutoContext,
  tenantDefault: DataClass = 3
): DataClass {
  let max: DataClass = 1

  max = bumpMax(max, classifyRecord("projects", ctx.project, tenantDefault))
  if (max === 3) return 3

  for (const phase of ctx.phases) {
    max = bumpMax(max, classifyRecord("phases", phase, tenantDefault))
    if (max === 3) return 3
  }
  for (const milestone of ctx.milestones) {
    max = bumpMax(max, classifyRecord("milestones", milestone, tenantDefault))
    if (max === 3) return 3
  }
  for (const item of ctx.work_items) {
    max = bumpMax(max, classifyRecord("work_items", item, tenantDefault))
    if (max === 3) return 3
  }
  for (const risk of ctx.existing_risks) {
    max = bumpMax(max, classifyRecord("risks", risk, tenantDefault))
    if (max === 3) return 3
  }

  return max
}
