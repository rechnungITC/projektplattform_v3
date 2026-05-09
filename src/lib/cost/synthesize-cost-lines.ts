/**
 * PROJ-24 — Phase 24-δ — Cost-line synthesizer (Replace-on-Update).
 *
 * One central helper that recomputes the FULL set of
 * `work_item_cost_lines.source_type='resource_allocation'` rows for a single
 * work-item from its current allocations and the latest applicable rates.
 *
 * Call sites (Phase 24-δ):
 *   - POST   /api/projects/[id]/work-items/[wid]/resources             (new allocation)
 *   - PATCH  /api/projects/[id]/work-items/[wid]/resources/[aid]       (allocation update)
 *   - DELETE /api/projects/[id]/work-items/[wid]/resources/[aid]       (allocation removal)
 *   - PATCH  /api/projects/[id]/work-items/[wid]                       (cost-driver attribute change)
 *
 * Behavior — Replace-on-Update (Tech Design §4 Decision #2 + §5 Scenario B):
 *   1. Load work-item (id, kind, attributes, created_at, tenant_id, project_id, is_deleted).
 *      Soft-deleted items emit no cost-lines (and the existing ones stay — view filters them).
 *   2. Load all current `work_item_resources` allocations for the item via service-role
 *      (the helper bypasses RLS so it works even if the caller is a tenant_admin without
 *      direct project_membership — same pattern as PROJ-22 budget-postings audit).
 *   3. Resolve the chain `resource → source_stakeholder_id → stakeholder.role_key` for
 *      each allocation. Missing stakeholder or role_key produces a warning, no cost-line.
 *   4. Pre-resolve the latest applicable rates via `resolveRoleRates()` using
 *      `work_item.created_at` as the cutoff (Tech Design §12 — locked decision).
 *   5. Run the pure-TS engine `calculateWorkItemCosts(...)` to compute drafts.
 *   6. DELETE all existing `resource_allocation` cost-lines for this work-item, then
 *      INSERT the new ones. Emit one synthetic-DELETE audit per dropped row and one
 *      synthetic-INSERT audit per new row (PROJ-22 budget-postings pattern).
 *   7. Manual cost-lines (`source_type='manual'`) are NEVER touched — only the
 *      `resource_allocation` discriminator is replaced.
 *
 * FAIL-OPEN — this helper MUST NEVER throw (Tech Design §12):
 *   - DB lookup errors → log + return `hadCostCalcError=true` and stop without writing.
 *   - Engine errors    → idem.
 *   - Audit failures   → caught inside `writeCostAuditEntry`, never propagate.
 *   - The caller's primary mutation (allocation INSERT/UPDATE/DELETE or work-item
 *     PATCH) MUST succeed regardless of what happens here.
 *
 * Audit volume note: a Replace-on-Update for a 20-allocation work-item writes up
 * to 20 DELETE-audits + 20 INSERT-audits. This is acceptable for MVP — refactor
 * to bulk audit if log-volume becomes a concern (PROJ-24b).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { writeCostAuditEntry } from "@/app/api/_lib/cost-audit"

import { calculateWorkItemCosts } from "./calculate-work-item-costs"
import { resolveResourceRates } from "./resource-rate-lookup"
import type {
  AllocationInput,
  CostCalcWarning,
  CostLineDraft,
  ResourceRateLookupKey,
  WorkItemCostInput,
} from "./types"

export interface SynthesizeCostLinesInput {
  /** MUST be a service-role admin client — see `role-rate-lookup.ts` JSDoc. */
  adminClient: SupabaseClient
  tenantId: string
  projectId: string
  workItemId: string
  /** Used as `actor_user_id` on synthetic audit rows. */
  actorUserId: string
}

export interface SynthesizeCostLinesResult {
  /** Number of new cost-lines written (excludes deletes). */
  written: number
  /** Engine + lookup warnings — non-fatal, surfaced for UI / observability. */
  warnings: CostCalcWarning[]
  /** True when lookup or engine raised — caller's mutation already succeeded. */
  hadCostCalcError: boolean
}

interface WorkItemRow {
  id: string
  kind: string
  attributes: Record<string, unknown> | null
  created_at: string
  tenant_id: string
  project_id: string
  is_deleted: boolean
}

interface AllocationRow {
  id: string
  resource_id: string
  allocation_pct: number | string | null
}

interface ResourceRow {
  id: string
  source_stakeholder_id: string | null
}

interface StakeholderRow {
  id: string
  role_key: string | null
}

interface CostLineRow {
  id: string
  amount: number | string
  currency: string
  source_ref_id: string | null
  source_metadata: Record<string, unknown> | null
}

/**
 * Recompute and replace all `resource_allocation` cost-lines for one work-item.
 *
 * NEVER throws — caller can `await` without try/catch.
 */
export async function synthesizeResourceAllocationCostLines(
  input: SynthesizeCostLinesInput
): Promise<SynthesizeCostLinesResult> {
  const empty: SynthesizeCostLinesResult = {
    written: 0,
    warnings: [],
    hadCostCalcError: false,
  }
  try {
    return await runSynthesis(input)
  } catch (err) {
    console.error(
      `[PROJ-24 synthesize] unexpected error for work_item=${input.workItemId}:`,
      err
    )
    return { ...empty, hadCostCalcError: true }
  }
}

async function runSynthesis(
  input: SynthesizeCostLinesInput
): Promise<SynthesizeCostLinesResult> {
  const { adminClient, tenantId, projectId, workItemId, actorUserId } = input

  // -------------------------------------------------------------------------
  // 1) Load the work-item.
  // -------------------------------------------------------------------------
  const wiRes = await adminClient
    .from("work_items")
    .select("id, kind, attributes, created_at, tenant_id, project_id, is_deleted")
    .eq("id", workItemId)
    .eq("project_id", projectId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (wiRes.error) {
    console.error(
      `[PROJ-24 synthesize] failed to load work_item ${workItemId}: ${wiRes.error.message}`
    )
    return { written: 0, warnings: [], hadCostCalcError: true }
  }
  const wi = wiRes.data as WorkItemRow | null
  if (!wi) {
    // Item was hard-deleted between caller's mutation and this hook.
    // Nothing to synthesize.
    return { written: 0, warnings: [], hadCostCalcError: false }
  }
  if (wi.is_deleted) {
    // Soft-deleted item: per Tech Design §4 Decision #9, cost-lines stay in
    // the table; the view filters them. No synthesis on soft-deleted items.
    return { written: 0, warnings: [], hadCostCalcError: false }
  }

  // -------------------------------------------------------------------------
  // 2) Load all current allocations on this work-item.
  // -------------------------------------------------------------------------
  const allocRes = await adminClient
    .from("work_item_resources")
    .select("id, resource_id, allocation_pct")
    .eq("work_item_id", workItemId)
    .eq("project_id", projectId)
    .eq("tenant_id", tenantId)
    .limit(500)
  if (allocRes.error) {
    console.error(
      `[PROJ-24 synthesize] failed to load allocations for work_item ${workItemId}: ${allocRes.error.message}`
    )
    return { written: 0, warnings: [], hadCostCalcError: true }
  }
  const allocations = (allocRes.data ?? []) as AllocationRow[]

  // -------------------------------------------------------------------------
  // 3) Resolve resource → stakeholder → role_key chain.
  // -------------------------------------------------------------------------
  // We always need a fresh chain — a stakeholder may have changed role_key
  // between this and the previous synthesis call.
  const resourceIds = Array.from(new Set(allocations.map((a) => a.resource_id)))

  let resources: ResourceRow[] = []
  if (resourceIds.length > 0) {
    const resRes = await adminClient
      .from("resources")
      .select("id, source_stakeholder_id")
      .in("id", resourceIds)
      .eq("tenant_id", tenantId)
    if (resRes.error) {
      console.error(
        `[PROJ-24 synthesize] failed to load resources for work_item ${workItemId}: ${resRes.error.message}`
      )
      return { written: 0, warnings: [], hadCostCalcError: true }
    }
    resources = (resRes.data ?? []) as ResourceRow[]
  }
  const stakeholderIdByResource = new Map<string, string | null>()
  for (const r of resources) {
    stakeholderIdByResource.set(r.id, r.source_stakeholder_id)
  }

  const stakeholderIds = Array.from(
    new Set(
      Array.from(stakeholderIdByResource.values()).filter(
        (s): s is string => typeof s === "string"
      )
    )
  )
  let stakeholders: StakeholderRow[] = []
  if (stakeholderIds.length > 0) {
    const shRes = await adminClient
      .from("stakeholders")
      .select("id, role_key")
      .in("id", stakeholderIds)
      .eq("tenant_id", tenantId)
    if (shRes.error) {
      console.error(
        `[PROJ-24 synthesize] failed to load stakeholders for work_item ${workItemId}: ${shRes.error.message}`
      )
      return { written: 0, warnings: [], hadCostCalcError: true }
    }
    stakeholders = (shRes.data ?? []) as StakeholderRow[]
  }
  const roleKeyByStakeholder = new Map<string, string | null>()
  for (const s of stakeholders) {
    roleKeyByStakeholder.set(s.id, s.role_key)
  }

  // -------------------------------------------------------------------------
  // 4) Build engine inputs (allocations + role_rate snapshots).
  // -------------------------------------------------------------------------
  const allocationInputs: AllocationInput[] = allocations.map((a) => {
    const stakeholderId = stakeholderIdByResource.get(a.resource_id) ?? null
    const roleKey = stakeholderId
      ? roleKeyByStakeholder.get(stakeholderId) ?? null
      : null
    return {
      allocation_id: a.id,
      resource_id: a.resource_id,
      allocation_pct:
        typeof a.allocation_pct === "string"
          ? Number(a.allocation_pct)
          : a.allocation_pct,
      role_key: roleKey,
      source_stakeholder_id: stakeholderId,
    }
  })

  // PROJ-54-α — Pre-resolve rates per resource_id at the work-item's
  // `created_at` cutoff. The SQL helper applies the canonical order:
  //   override on resources.daily_rate_override → role-rate via stakeholder
  //   role_key → no row (caller emits no_rate_for_role warning).
  const asOfDate = wi.created_at.slice(0, 10) // YYYY-MM-DD
  const distinctResourceIds = Array.from(
    new Set(
      allocationInputs
        .map((a) => a.resource_id)
        .filter((rid): rid is string => typeof rid === "string" && rid.length > 0),
    ),
  )
  const lookupKeys: ResourceRateLookupKey[] = distinctResourceIds.map((rid) => ({
    tenant_id: tenantId,
    resource_id: rid,
    as_of_date: asOfDate,
  }))

  const lookup = await resolveResourceRates({
    supabase: adminClient,
    keys: lookupKeys,
  })

  // -------------------------------------------------------------------------
  // 5) Load tenant velocity-factor + default-currency.
  // -------------------------------------------------------------------------
  const settingsRes = await adminClient
    .from("tenant_settings")
    .select("cost_settings")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (settingsRes.error) {
    console.error(
      `[PROJ-24 synthesize] failed to load tenant_settings for tenant ${tenantId}: ${settingsRes.error.message}`
    )
    return { written: 0, warnings: [], hadCostCalcError: true }
  }
  const cost = (settingsRes.data?.cost_settings ?? {}) as Record<string, unknown>
  const velocityRaw = cost.velocity_factor
  const velocityFactor =
    typeof velocityRaw === "number" && Number.isFinite(velocityRaw)
      ? velocityRaw
      : 0.5
  const defaultCurrency =
    typeof cost.default_currency === "string" ? cost.default_currency : "EUR"

  // -------------------------------------------------------------------------
  // 6) Run the pure-TS engine.
  // -------------------------------------------------------------------------
  const attributes = (wi.attributes ?? {}) as Record<string, unknown>
  const storyPointsRaw = attributes.story_points
  const durationRaw = attributes.estimated_duration_days
  const workItemInput: WorkItemCostInput = {
    work_item_id: wi.id,
    kind: wi.kind,
    story_points:
      typeof storyPointsRaw === "number" && Number.isFinite(storyPointsRaw)
        ? storyPointsRaw
        : null,
    estimated_duration_days:
      typeof durationRaw === "number" && Number.isFinite(durationRaw)
        ? durationRaw
        : null,
    created_at: wi.created_at,
  }

  let drafts: CostLineDraft[] = []
  let engineWarnings: CostCalcWarning[] = []
  try {
    const result = calculateWorkItemCosts({
      work_item: workItemInput,
      allocations: allocationInputs,
      // PROJ-54-α — pass per-resource resolutions; engine indexes by
      // resource_id and falls back to role_rates only when no resolution
      // exists (defensive — should not happen in production paths).
      resolved_rates: lookup.resolved,
      role_rates: [],
      velocity_factor: velocityFactor,
      default_currency: defaultCurrency,
    })
    drafts = result.cost_lines
    engineWarnings = result.warnings
  } catch (err) {
    // Engine is pure TS and unit-tested — this is defense-in-depth.
    console.error(
      `[PROJ-24 synthesize] engine threw for work_item ${workItemId}:`,
      err
    )
    return { written: 0, warnings: [], hadCostCalcError: true }
  }

  // -------------------------------------------------------------------------
  // 7) Replace existing resource_allocation cost-lines.
  // -------------------------------------------------------------------------
  const existingRes = await adminClient
    .from("work_item_cost_lines")
    .select("id, amount, currency, source_ref_id, source_metadata")
    .eq("work_item_id", workItemId)
    .eq("project_id", projectId)
    .eq("tenant_id", tenantId)
    .eq("source_type", "resource_allocation")
  if (existingRes.error) {
    console.error(
      `[PROJ-24 synthesize] failed to read existing cost-lines for work_item ${workItemId}: ${existingRes.error.message}`
    )
    return { written: 0, warnings: engineWarnings, hadCostCalcError: true }
  }
  const existingLines = (existingRes.data ?? []) as CostLineRow[]

  if (existingLines.length > 0) {
    const delRes = await adminClient
      .from("work_item_cost_lines")
      .delete()
      .eq("work_item_id", workItemId)
      .eq("project_id", projectId)
      .eq("tenant_id", tenantId)
      .eq("source_type", "resource_allocation")
    if (delRes.error) {
      console.error(
        `[PROJ-24 synthesize] failed to delete existing cost-lines for work_item ${workItemId}: ${delRes.error.message}`
      )
      return { written: 0, warnings: engineWarnings, hadCostCalcError: true }
    }
    // Synthetic DELETE audit per dropped row. Best-effort, never throws.
    for (const old of existingLines) {
      await writeCostAuditEntry({
        tenantId,
        entity: "work_item_cost_lines",
        entityId: old.id,
        action: "delete",
        oldValue: {
          amount: typeof old.amount === "string" ? Number(old.amount) : old.amount,
          currency: old.currency,
          source_ref_id: old.source_ref_id,
          source_metadata: old.source_metadata,
          source_type: "resource_allocation",
        },
        newValue: null,
        actorUserId,
        reason: "Cost-Line ersetzt (Allocation-Aenderung)",
      })
    }
  }

  // INSERT new drafts (if any).
  if (drafts.length === 0) {
    return {
      written: 0,
      warnings: engineWarnings,
      hadCostCalcError: false,
    }
  }

  const insertPayload = drafts.map((d) => ({
    tenant_id: tenantId,
    project_id: projectId,
    work_item_id: d.work_item_id,
    source_type: d.source_type,
    amount: d.amount,
    currency: d.currency,
    source_ref_id: d.source_ref_id,
    source_metadata: d.source_metadata,
    created_by: actorUserId,
  }))

  const insertRes = await adminClient
    .from("work_item_cost_lines")
    .insert(insertPayload)
    .select("id, amount, currency, source_ref_id, source_metadata")
  if (insertRes.error) {
    console.error(
      `[PROJ-24 synthesize] failed to insert cost-lines for work_item ${workItemId}: ${insertRes.error.message}`
    )
    return { written: 0, warnings: engineWarnings, hadCostCalcError: true }
  }
  const inserted = (insertRes.data ?? []) as CostLineRow[]

  // Synthetic INSERT audit per new row.
  for (const row of inserted) {
    await writeCostAuditEntry({
      tenantId,
      entity: "work_item_cost_lines",
      entityId: row.id,
      action: "insert",
      oldValue: null,
      newValue: {
        amount: typeof row.amount === "string" ? Number(row.amount) : row.amount,
        currency: row.currency,
        source_ref_id: row.source_ref_id,
        source_metadata: row.source_metadata,
        source_type: "resource_allocation",
      },
      actorUserId,
      reason: "Cost-Line erzeugt (Allocation-Hook)",
    })
  }

  return {
    written: inserted.length,
    warnings: engineWarnings,
    hadCostCalcError: false,
  }
}
