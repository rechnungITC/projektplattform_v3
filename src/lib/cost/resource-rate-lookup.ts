/**
 * PROJ-54-α — Resource-rate lookup layer (override-aware).
 *
 * Resolves a batch of `(tenant_id, resource_id, as_of_date)` lookup keys into
 * `ResolvedRate[]` by calling the SQL helper `_resolve_resource_rate(...)`
 * via RPC. The helper internally encapsulates the canonical resolution order:
 *
 *   1. resources.daily_rate_override        → ResolvedRate{ source: 'override' }
 *   2. else: stakeholder-role via role_rate → ResolvedRate{ source: 'role' }
 *   3. else: no row                         → key lands in `missing[]`
 *
 * SECURITY: this layer MUST be invoked with a service-role Supabase client.
 *
 *   The PROJ-54-α migration revokes EXECUTE on `_resolve_resource_rate` from
 *   `authenticated`; only `service_role` retains it (analog to the PROJ-24
 *   `_resolve_role_rate` lockdown migration `20260503110000`). Callers must
 *   use `createAdminClient()` from `@/lib/supabase/admin`. This module does
 *   NOT verify the supplied client carries service-role headers — the
 *   constraint is documented and enforced at the JSDoc level.
 *
 * Behavior:
 *   - Duplicate keys are deduplicated before RPC dispatch (Performance —
 *     same resource_id resolves once even if requested for many work-items).
 *   - Per-key RPC failures are FAIL-OPEN: the failing key lands in the
 *     `missing[]` bucket, not `resolved[]`, and the lookup does NOT throw.
 *     This matches the engine's contract that a missing rate produces a
 *     placeholder cost-line with a `no_rate_for_role` warning rather than
 *     blocking the allocation write (see PROJ-24 Tech Design §12).
 *   - Concurrency: RPC calls run in parallel via Promise.all.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { ResolvedRate, ResourceRateLookupKey } from "./types"

interface ResolveResourceRatesArgs {
  /** MUST be a service-role Supabase admin client. See module-level note. */
  supabase: SupabaseClient
  keys: ResourceRateLookupKey[]
}

interface ResolveResourceRatesResult {
  /** One snapshot per key that resolved to either an override-rate or a
   *  role-rate. Indexed externally via Map<resource_id, ResolvedRate> by
   *  the caller; this layer returns a flat list. */
  resolved: ResolvedRate[]
  /** Keys that did not resolve, either because no row matched (no override
   *  AND no stakeholder-role chain that has a role_rate at the cutoff) or
   *  because the RPC errored. The lookup is fail-open — errors are logged
   *  but surface as "missing", not as thrown exceptions. */
  missing: ResourceRateLookupKey[]
}

/**
 * Resolve a batch of resource-rate lookup keys.
 */
export async function resolveResourceRates(
  args: ResolveResourceRatesArgs,
): Promise<ResolveResourceRatesResult> {
  const { supabase, keys } = args
  if (keys.length === 0) {
    return { resolved: [], missing: [] }
  }

  // Dedupe by composite key (tenant_id × resource_id × as_of_date). A single
  // synthesis-run uses a single as_of_date (work_item.created_at) so dedup
  // primarily collapses repeated resource_ids across multiple allocations of
  // the same resource on the same work-item.
  const seen = new Set<string>()
  const uniqueKeys: ResourceRateLookupKey[] = []
  for (const k of keys) {
    const ck = `${k.tenant_id}::${k.resource_id}::${k.as_of_date}`
    if (seen.has(ck)) continue
    seen.add(ck)
    uniqueKeys.push(k)
  }

  const settled = await Promise.all(
    uniqueKeys.map(async (key) => {
      const { data, error } = await supabase.rpc("_resolve_resource_rate", {
        p_tenant_id: key.tenant_id,
        p_resource_id: key.resource_id,
        p_as_of_date: key.as_of_date,
      })
      if (error) {
        // Fail-open: log + treat as missing. Do not throw — a degraded
        // allocation write is preferable to a hard block.
        console.error(
          `[PROJ-54] _resolve_resource_rate RPC failed for tenant=${key.tenant_id} ` +
            `resource=${key.resource_id} as_of=${key.as_of_date}: ${error.message}`,
        )
        return { key, snapshot: null }
      }
      const parsed = parseRpcRow(data)
      // The SQL helper returns `resource_id` only for the override branch;
      // for role-based resolutions it returns NULL. We always inject the
      // input key's resource_id so the engine can index uniformly.
      const snapshot: ResolvedRate | null = parsed
        ? { ...parsed, resource_id: key.resource_id }
        : null
      return { key, snapshot }
    }),
  )

  const resolved: ResolvedRate[] = []
  const missing: ResourceRateLookupKey[] = []
  for (const r of settled) {
    if (r.snapshot) {
      resolved.push(r.snapshot)
    } else {
      missing.push(r.key)
    }
  }

  return { resolved, missing }
}

/**
 * Parse the RPC response into a `ResolvedRate`. The SQL function declares
 * `RETURNS TABLE(...)` which postgrest surfaces as an array; an empty array
 * means "no row" (caller treats as missing). Some clients also wrap a
 * single composite into an object — defensively accept both.
 */
function parseRpcRow(data: unknown): ResolvedRate | null {
  if (data == null) return null
  const obj = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)
    : (data as Record<string, unknown>)
  if (!obj || typeof obj !== "object") return null

  const tenant_id = obj.tenant_id
  const sourceRaw = obj.source
  const role_key = obj.role_key ?? null
  const resource_id = obj.resource_id ?? null
  const daily_rate_raw = obj.daily_rate
  const currency = obj.currency
  const valid_from_raw = obj.valid_from ?? null

  if (typeof tenant_id !== "string") return null
  if (sourceRaw !== "override" && sourceRaw !== "role") return null
  if (typeof currency !== "string") return null

  const daily_rate =
    typeof daily_rate_raw === "number"
      ? daily_rate_raw
      : typeof daily_rate_raw === "string"
        ? Number(daily_rate_raw)
        : NaN
  if (!Number.isFinite(daily_rate)) return null

  return {
    tenant_id,
    source: sourceRaw,
    role_key:
      typeof role_key === "string" && role_key.length > 0 ? role_key : null,
    resource_id:
      typeof resource_id === "string" && resource_id.length > 0
        ? resource_id
        : null,
    daily_rate,
    currency,
    valid_from:
      typeof valid_from_raw === "string" && valid_from_raw.length > 0
        ? valid_from_raw
        : null,
  }
}
