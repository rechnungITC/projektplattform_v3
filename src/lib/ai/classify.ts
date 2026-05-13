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
import type {
  DataClass,
  NarrativeAutoContext,
  RiskAutoContext,
  SentimentAutoContext,
} from "./types"

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

// ---------------------------------------------------------------------------
// PROJ-30 — narrative-purpose classifier (whitelist-based)
// ---------------------------------------------------------------------------

/**
 * Whitelist of fields explicitly permitted in `NarrativeAutoContext`.
 * Anything not on the list is treated as Class-3 — "fail safe" choice
 * per Tech-Design § Decision 4. When extending the auto-context shape,
 * add the new field key here AND update `data-privacy-registry` if
 * needed.
 *
 * Keys are unprefixed (table-agnostic) because the narrative context is
 * a flat synthetic shape, not a per-table dump.
 */
const NARRATIVE_FIELD_WHITELIST: ReadonlySet<string> = new Set([
  // top-level discriminator
  "kind",
  // project block (Class-1/2)
  "name",
  "project_type",
  "project_method",
  "lifecycle_status",
  "planned_start_date",
  "planned_end_date",
  // phases_summary block
  "total",
  "by_status",
  // top_risks items
  "title",
  "score",
  "status",
  // top_decisions items
  "decided_at",
  // upcoming_milestones items
  "target_date",
  // backlog_counts block
  "by_kind",
])

const NARRATIVE_BLOCK_KEYS: ReadonlySet<string> = new Set([
  "project",
  "phases_summary",
  "top_risks",
  "top_decisions",
  "upcoming_milestones",
  "backlog_counts",
])

function classifyNarrativeRecord(
  record: Record<string, unknown>,
): DataClass {
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === "") continue
    if (!NARRATIVE_FIELD_WHITELIST.has(key)) {
      return 3
    }
  }
  return 2
}

/**
 * PROJ-30 — classify a `NarrativeAutoContext` payload.
 *
 * Returns:
 *   - 1 when the context is empty/structural
 *   - 2 when only whitelisted Class-1/2 fields are present (default)
 *   - 3 when ANY un-whitelisted field appears anywhere in the payload
 *
 * `tenantDefault` raises the floor — a tenant configured with
 * `default_class=3` will see narrative routed locally even on a
 * fully-whitelisted context. This matches the Risk classifier's
 * tenant-default semantics.
 */
export function classifyNarrativeAutoContext(
  ctx: NarrativeAutoContext,
  tenantDefault: DataClass = 3,
): DataClass {
  let max: DataClass = 1

  for (const [topKey, topValue] of Object.entries(ctx)) {
    if (topValue === null || topValue === undefined) continue
    if (
      !NARRATIVE_FIELD_WHITELIST.has(topKey) &&
      !NARRATIVE_BLOCK_KEYS.has(topKey)
    ) {
      return 3
    }
    if (
      typeof topValue === "object" &&
      !Array.isArray(topValue) &&
      topValue !== null
    ) {
      const blockClass = classifyNarrativeRecord(
        topValue as Record<string, unknown>,
      )
      max = bumpMax(max, blockClass)
      if (max === 3) return 3
    }
    if (Array.isArray(topValue)) {
      for (const item of topValue) {
        if (item === null || typeof item !== "object") continue
        const itemClass = classifyNarrativeRecord(
          item as Record<string, unknown>,
        )
        max = bumpMax(max, itemClass)
        if (max === 3) return 3
      }
    }
  }

  // Per-tenant floor — Class-3 tenants force local even on safe contexts.
  if (tenantDefault === 3 && max < 2) {
    // empty context is still safe to keep at Class 1 if the registry
    // didn't flag anything; the tenant default kicks in only when we
    // would have routed external. Risk-classifier semantics preserved.
    return max
  }

  return max
}

/**
 * PROJ-34-γ.1 — sentiment classifier (CIA-L1).
 *
 * Sentiment- und Coaching-Summaries enthalten zwangsläufig identifizierbare
 * Personenbezüge (Stakeholder-Namen + Verhaltensbewertung). Per CIA-L1
 * werden sie ausnahmslos als Class-3 klassifiziert — kein Class-2-Bypass,
 * Tenant-Provider-Pflicht ohne Ausnahme.
 *
 * Der `tenantDefault`-Parameter bleibt aus Symmetriegründen erhalten, hat
 * aber keine Wirkung — Class-3 ist hier eine Konstante.
 */
export function classifySentimentAutoContext(
  _ctx: SentimentAutoContext,
  _tenantDefault: DataClass = 3,
): DataClass {
  return 3
}
