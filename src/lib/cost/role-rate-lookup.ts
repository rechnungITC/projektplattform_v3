/**
 * PROJ-24 — Role-rate lookup layer.
 *
 * Resolves a batch of `(tenant_id, role_key, as_of_date)` lookup keys into
 * `RoleRateSnapshot[]` by calling the SQL helper `_resolve_role_rate(...)`
 * via RPC.
 *
 * SECURITY: this layer MUST be invoked with a service-role Supabase client.
 *
 *   Migration `20260502170000_proj24_resolve_role_rate_lockdown.sql` revokes
 *   EXECUTE on `_resolve_role_rate` from `authenticated`; only `service_role`
 *   retains it. Callers must use `createAdminClient()` from
 *   `@/lib/supabase/admin`. This module does NOT verify that the supplied
 *   client is service-role (no header introspection in supabase-js); the
 *   constraint is documented and enforced at the JSDoc level.
 *
 * Behavior:
 *   - Duplicate keys are deduplicated before RPC dispatch (Performance —
 *     same role_key resolves once even if requested for many work-items).
 *   - Per-key RPC failures are FAIL-OPEN: the failing key lands in the
 *     `missing[]` bucket, not `resolved[]`, and the lookup does NOT throw.
 *     This matches the engine's contract that a missing rate produces a
 *     placeholder cost-line with a `no_rate_for_role` warning rather than
 *     blocking the allocation write (see Tech Design §12).
 *   - Concurrency: RPC calls run in parallel via Promise.all.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { RoleRateLookupKey, RoleRateSnapshot } from "./types"

interface ResolveRoleRatesArgs {
  /** MUST be a service-role Supabase admin client. See module-level note. */
  supabase: SupabaseClient
  keys: RoleRateLookupKey[]
}

interface ResolveRoleRatesResult {
  /** One snapshot per key that resolved to a non-null rate. */
  resolved: RoleRateSnapshot[]
  /** Keys that did not resolve, either because no row matched or because
   *  the RPC errored. The lookup is fail-open — errors are logged but
   *  surface as "missing", not as thrown exceptions. */
  missing: RoleRateLookupKey[]
}

/**
 * Resolve a batch of role-rate lookup keys.
 */
export async function resolveRoleRates(
  args: ResolveRoleRatesArgs
): Promise<ResolveRoleRatesResult> {
  const { supabase, keys } = args
  if (keys.length === 0) {
    return { resolved: [], missing: [] }
  }

  // Dedupe by composite key. The engine matches on role_key only (after
  // tenant filtering), but we keep tenant_id in the composite to be explicit
  // and to allow future cross-tenant batch lookups (currently unused).
  const seen = new Set<string>()
  const uniqueKeys: RoleRateLookupKey[] = []
  for (const k of keys) {
    const ck = `${k.tenant_id}::${k.role_key}::${k.as_of_date}`
    if (seen.has(ck)) continue
    seen.add(ck)
    uniqueKeys.push(k)
  }

  const settled = await Promise.all(
    uniqueKeys.map(async (key) => {
      const { data, error } = await supabase.rpc("_resolve_role_rate", {
        p_tenant_id: key.tenant_id,
        p_role_key: key.role_key,
        p_as_of_date: key.as_of_date,
      })
      if (error) {
        // Fail-open: log + treat as missing. Do not throw — a degraded
        // allocation write is preferable to a hard block per Tech Design
        // §12 ("a cost-calc error must not block the allocation write").
        console.error(
          `[PROJ-24] _resolve_role_rate RPC failed for tenant=${key.tenant_id} role=${key.role_key} as_of=${key.as_of_date}: ${error.message}`
        )
        return { key, snapshot: null }
      }
      const snapshot = parseRpcRow(data)
      return { key, snapshot }
    })
  )

  const resolved: RoleRateSnapshot[] = []
  const missing: RoleRateLookupKey[] = []
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
 * Parse the RPC response into a `RoleRateSnapshot`. The function returns a
 * `role_rates` row (or NULL when nothing matches). Postgres SQL-language
 * functions returning a composite type with no match return NULL, which
 * supabase-js surfaces as `data: null`. Some clients also return
 * `data: { ... }` with a row — we accept both shapes.
 */
function parseRpcRow(data: unknown): RoleRateSnapshot | null {
  if (!data || typeof data !== "object") return null
  const row = data as Record<string, unknown>
  // supabase-js may wrap composite returns into an array depending on
  // configuration; defensively unwrap.
  const obj = Array.isArray(data) ? (data[0] as Record<string, unknown>) : row
  if (!obj) return null

  const tenant_id = obj.tenant_id
  const role_key = obj.role_key
  const daily_rate_raw = obj.daily_rate
  const currency = obj.currency
  const valid_from = obj.valid_from

  if (
    typeof tenant_id !== "string" ||
    typeof role_key !== "string" ||
    typeof currency !== "string" ||
    typeof valid_from !== "string"
  ) {
    return null
  }

  // numeric(10,2) is delivered as either a JS number or a string by
  // PostgREST/supabase-js depending on driver config. Coerce safely.
  const daily_rate =
    typeof daily_rate_raw === "number"
      ? daily_rate_raw
      : typeof daily_rate_raw === "string"
        ? Number(daily_rate_raw)
        : NaN
  if (!Number.isFinite(daily_rate)) return null

  return { tenant_id, role_key, daily_rate, currency, valid_from }
}
