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
 *   `_resolve_role_rate` lockdown migration). Callers must use
 *   `createAdminClient()` from `@/lib/supabase/admin`. This module does NOT
 *   verify the supplied client carries service-role headers — the constraint
 *   is documented and enforced at the JSDoc level.
 *
 * Behavior:
 *   - Duplicate keys are deduplicated before RPC dispatch.
 *   - Per-key RPC failures are FAIL-OPEN: the failing key lands in
 *     `missing[]`, not `resolved[]`, and the lookup does NOT throw. Matches
 *     the engine's contract that a missing rate produces a placeholder
 *     cost-line with a `no_rate_for_role` warning rather than blocking the
 *     allocation write (PROJ-24 Tech Design §12).
 *   - Concurrency: RPC calls run in parallel via Promise.all.
 *   - Normalization: the SQL helper returns `resource_id = NULL` on the
 *     role-fallback branch. This layer ALWAYS rewrites `resource_id` to the
 *     input key's resource_id so the engine can index uniformly.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { ResolvedRate, ResourceRateLookupKey } from "./types"

interface ResolveResourceRatesArgs {
  /** MUST be a service-role Supabase admin client. See module-level note. */
  supabase: SupabaseClient
  keys: ResourceRateLookupKey[]
}

interface ResolveResourceRatesResult {
  resolved: ResolvedRate[]
  missing: ResourceRateLookupKey[]
}

export async function resolveResourceRates(
  args: ResolveResourceRatesArgs,
): Promise<ResolveResourceRatesResult> {
  const { supabase, keys } = args
  if (keys.length === 0) {
    return { resolved: [], missing: [] }
  }

  // Dedupe by composite key (tenant × resource × as_of_date).
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
        console.error(
          `[PROJ-54] _resolve_resource_rate RPC failed for tenant=${key.tenant_id} ` +
            `resource=${key.resource_id} as_of=${key.as_of_date}: ${error.message}`,
        )
        return { key, snapshot: null }
      }
      const parsed = parseRpcRow(data)
      // Normalize resource_id (the SQL helper returns NULL for role branch).
      const snapshot: ResolvedRate | null = parsed
        ? { ...parsed, resource_id: key.resource_id }
        : null
      return { key, snapshot }
    }),
  )

  const resolved: ResolvedRate[] = []
  const missing: ResourceRateLookupKey[] = []
  for (const r of settled) {
    if (r.snapshot) resolved.push(r.snapshot)
    else missing.push(r.key)
  }

  return { resolved, missing }
}

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
