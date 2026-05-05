/**
 * PROJ-32 — AI provider key resolution.
 *
 * 32-c-β refactor (Forks D + F + G locked):
 *   * Reads from the new `tenant_ai_providers` table (via the new
 *     SECURITY DEFINER RPC `decrypt_tenant_ai_provider`).
 *   * Layered Cache: `getTenantProviders` and `getPriorityMatrix` are
 *     cached per-request via `React.cache()`. The pure `resolveProvider`
 *     combines them without a separate cache to avoid Cache-Slot-
 *     Explosion when called for many (purpose, dataClass) combinations.
 *   * Class-3 defense-in-depth: even if a (future) priority matrix rule
 *     names an external provider for Class-3, this resolver clamps the
 *     resolved provider list to local-only providers (Ollama). The
 *     write-side validation in the priority API route is the first
 *     defense; this is the second.
 *
 * The 32a-style `resolveAnthropicKey()` is preserved as a thin wrapper
 * for the duration of 32-c-β so deployed-but-unmigrated callers keep
 * working until they migrate to `resolveProvider()`. Once all callers
 * have moved, `resolveAnthropicKey` can be removed in 32-c-γ cleanup.
 *
 * Server-only: this file MUST NOT be imported from client components.
 * Plaintext key material flows through it.
 */

import { cache } from "react"

import type { SupabaseClient } from "@supabase/supabase-js"

import { isExternalAIBlocked } from "@/lib/operation-mode"

import type { AIPurpose, DataClass } from "./types"

export type AIKeyProvider = "anthropic" | "ollama" | "openai" | "google"

/** Provider configs after decryption — provider-specific JSONB shapes. */
export type ProviderConfig =
  | { kind: "anthropic"; api_key: string }
  | {
      kind: "ollama"
      endpoint_url: string
      model_id: string
      bearer_token?: string
    }
  | { kind: "openai"; api_key: string; model_id?: string }
  | { kind: "google"; api_key: string; model_id?: string }

export interface ProviderRecord {
  provider: AIKeyProvider
  status: "valid" | "invalid" | "rate_limited" | "unreachable" | "model_missing" | "unknown" | null
  config: ProviderConfig
}

/**
 * Resolved provider for a single (tenant, purpose, dataClass) lookup.
 * Discriminated union so callers can branch cleanly.
 */
export type ResolvedProvider =
  | {
      source: "tenant"
      provider: AIKeyProvider
      config: ProviderConfig
    }
  | {
      source: "platform"
      provider: "anthropic"
      key: string
    }
  | {
      source: "blocked"
      reason: BlockedReason
    }

export type BlockedReason =
  | "class3_no_local_provider"
  | "external_ai_disabled"
  | "no_provider_available"

interface ResolveArgs {
  supabase: SupabaseClient
  tenantId: string
  purpose: AIPurpose
  dataClass: DataClass
}

// ---------------------------------------------------------------------------
// Layered Cache — Fork D.2 lock.
// ---------------------------------------------------------------------------

/**
 * Bulk-fetch + decrypt all providers configured for a tenant. Cached
 * per-request via `React.cache()`. One RPC roundtrip total regardless
 * of how many providers exist.
 *
 * Returns a Map keyed by provider name. Includes status so the
 * resolver can skip providers in `invalid` state.
 */
const getTenantProviders = cache(
  async (
    supabase: SupabaseClient,
    tenantId: string,
  ): Promise<Map<AIKeyProvider, ProviderRecord>> => {
    const result = new Map<AIKeyProvider, ProviderRecord>()

    const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY
    if (!encryptionKey) {
      console.error(
        "[key-resolver] SECRETS_ENCRYPTION_KEY env var is not set — " +
          "tenant AI providers are unreadable. Falling back to platform key.",
      )
      return result
    }

    // Read provider rows + status from the new table. RLS limits this
    // to admin-only — we use it only to know WHICH providers are
    // configured. The actual decryption goes via the SECURITY DEFINER
    // RPC which is member-callable.
    //
    // Subtlety: if the caller is not admin, this select returns 0 rows,
    // but the RPC below works for any tenant member. We must not rely
    // on the select for the "configured" check — instead, attempt
    // decryption for both known providers and treat null as
    // "not configured".
    const { error: gucErr } = await supabase.rpc(
      "set_session_encryption_key",
      { p_key: encryptionKey },
    )
    if (gucErr) {
      throw new Error(
        `set_session_encryption_key failed: ${gucErr.message}`,
      )
    }

    // Try each provider individually via the member-callable RPC. We
    // could batch into one query if RPC supported tuple inputs, but
    // 2-4 providers per tenant is small enough that the latency is
    // dominated by the GUC + decrypt itself.
    const providers: AIKeyProvider[] = [
      "anthropic",
      "ollama",
      "openai",
      "google",
    ]
    for (const provider of providers) {
      const { data, error } = await supabase.rpc("decrypt_tenant_ai_provider", {
        p_tenant_id: tenantId,
        p_provider: provider,
      })
      if (error) {
        throw new Error(
          `decrypt_tenant_ai_provider(${provider}) failed: ${error.message}`,
        )
      }
      if (data === null || data === undefined) continue

      const config = parseProviderConfig(provider, data)
      if (!config) continue

      // Best-effort status fetch — if RLS hides it (caller is non-admin
      // member, which is the routing case), default to null. The
      // resolver treats null as "assume usable".
      const { data: meta } = await supabase
        .from("tenant_ai_providers")
        .select("last_validation_status")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .maybeSingle()

      const status =
        (meta?.last_validation_status as ProviderRecord["status"]) ?? null

      result.set(provider, { provider, status, config })
    }

    return result
  },
)

/**
 * Bulk-fetch the priority matrix for a tenant. Reads all configured
 * (purpose, data_class) → provider_order rules in a single SELECT and
 * returns them as a Map keyed by `${purpose}:${dataClass}` for O(1)
 * lookup in the pure resolver function.
 *
 * Cached per-request via `React.cache()` (Fork D.2).
 *
 * Member-callable: the priority table itself contains no plaintext key
 * material — only references to provider names — and member-level RLS
 * was added in 32-c-γ so the routing path can read it. Without this,
 * every AI call by a non-admin would silently fall back to defaults.
 */
const getPriorityMatrix = cache(
  async (
    supabase: SupabaseClient,
    tenantId: string,
  ): Promise<Map<string, AIKeyProvider[]>> => {
    const result = new Map<string, AIKeyProvider[]>()
    const { data, error } = await supabase
      .from("tenant_ai_provider_priority")
      .select("purpose, data_class, provider_order")
      .eq("tenant_id", tenantId)

    if (error) {
      // Treat as "no rules" rather than throwing — defaults are still safe.
      console.error(
        `[key-resolver] getPriorityMatrix failed for ${tenantId}: ${error.message}. Falling back to defaults.`,
      )
      return result
    }

    for (const row of data ?? []) {
      const purpose = row.purpose as AIPurpose | null
      const dataClass = row.data_class as DataClass | null
      const order = row.provider_order as string[] | null
      if (!purpose || dataClass == null || !Array.isArray(order)) continue
      const key = `${purpose}:${dataClass}`
      // Filter to known providers; the DB CHECK already enforces this
      // but defense-in-depth at the boundary doesn't hurt.
      const filtered = order.filter(
        (p): p is AIKeyProvider => p === "anthropic" || p === "ollama",
      )
      if (filtered.length > 0) result.set(key, filtered)
    }
    return result
  },
)

// ---------------------------------------------------------------------------
// Pure resolver logic — combines the two cached lookups.
// ---------------------------------------------------------------------------

/**
 * Provider order to attempt when no priority-matrix rule exists for
 * the given (purpose, dataClass). Class-3 routes only to local
 * providers (Ollama); Class-1/2 prefer Anthropic but fall back to
 * Ollama if Anthropic is missing.
 */
function defaultProviderOrder(
  dataClass: DataClass,
  available: Map<AIKeyProvider, ProviderRecord>,
): AIKeyProvider[] {
  if (dataClass === 3) {
    return available.has("ollama") ? ["ollama"] : []
  }
  // Class-1/2 default: Anthropic preferred, then OpenAI, Google, Ollama as
  // fallbacks. The order encodes our quality bias for risk + narrative
  // generation; tenants override per-purpose via the priority matrix.
  const order: AIKeyProvider[] = []
  if (available.has("anthropic")) order.push("anthropic")
  if (available.has("openai")) order.push("openai")
  if (available.has("google")) order.push("google")
  if (available.has("ollama")) order.push("ollama")
  return order
}

/**
 * Class-3 defense-in-depth: even when a priority matrix names an
 * external provider for Class-3, the resolver removes it. The matrix
 * save-route also rejects this configuration at write time, but we
 * must not trust write-time validation alone (CIA HIGH risk).
 */
const LOCAL_ONLY_PROVIDERS: AIKeyProvider[] = ["ollama"]

function clampForClass3(
  order: AIKeyProvider[],
  dataClass: DataClass,
): AIKeyProvider[] {
  if (dataClass !== 3) return order
  return order.filter((p) => LOCAL_ONLY_PROVIDERS.includes(p))
}

/**
 * Public entry point — single (tenant, purpose, dataClass) → resolved
 * provider. Caller responsibilities:
 *   * Pass an authenticated user-context Supabase client (tenant member).
 *   * Branch on the discriminated union: tenant / platform / blocked.
 *
 * Plaintext key material lives only for the duration of the request
 * and is GC'ed after the route handler returns.
 */
export async function resolveProvider({
  supabase,
  tenantId,
  purpose,
  dataClass,
}: ResolveArgs): Promise<ResolvedProvider> {
  // Global kill-switch: blocked regardless of tenant config.
  if (isExternalAIBlocked()) {
    return { source: "blocked", reason: "external_ai_disabled" }
  }

  const [providers, matrix] = await Promise.all([
    getTenantProviders(supabase, tenantId),
    getPriorityMatrix(supabase, tenantId),
  ])

  const matrixKey = `${purpose}:${dataClass}`
  const ruleOrder = matrix.get(matrixKey)
  let order: AIKeyProvider[] =
    ruleOrder && ruleOrder.length > 0
      ? ruleOrder
      : defaultProviderOrder(dataClass, providers)
  order = clampForClass3(order, dataClass)

  for (const provider of order) {
    const record = providers.get(provider)
    if (!record) continue
    // Skip providers known to be invalid. `null` and other states are
    // treated as usable (the actual call may still fail; that's the
    // router's concern).
    if (record.status === "invalid") continue
    return { source: "tenant", provider, config: record.config }
  }

  // No tenant provider available. Class-3 short-circuits to blocked
  // (no platform fallback for Class-3 ever).
  if (dataClass === 3) {
    return { source: "blocked", reason: "class3_no_local_provider" }
  }

  // Class-1/2 fall back to platform Anthropic key.
  const platformKey = process.env.ANTHROPIC_API_KEY
  if (platformKey) {
    return { source: "platform", provider: "anthropic", key: platformKey }
  }

  return { source: "blocked", reason: "no_provider_available" }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseProviderConfig(
  provider: AIKeyProvider,
  raw: unknown,
): ProviderConfig | null {
  if (raw === null || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>

  if (provider === "anthropic") {
    const apiKey = obj.api_key
    if (typeof apiKey !== "string" || apiKey.length === 0) return null
    return { kind: "anthropic", api_key: apiKey }
  }

  if (provider === "ollama") {
    const endpoint = obj.endpoint_url
    const model = obj.model_id
    if (typeof endpoint !== "string" || endpoint.length === 0) return null
    if (typeof model !== "string" || model.length === 0) return null
    const bearer = obj.bearer_token
    return {
      kind: "ollama",
      endpoint_url: endpoint,
      model_id: model,
      bearer_token: typeof bearer === "string" && bearer.length > 0
        ? bearer
        : undefined,
    }
  }

  if (provider === "openai") {
    const apiKey = obj.api_key
    if (typeof apiKey !== "string" || apiKey.length === 0) return null
    const model = obj.model_id
    return {
      kind: "openai",
      api_key: apiKey,
      model_id: typeof model === "string" && model.length > 0 ? model : undefined,
    }
  }

  if (provider === "google") {
    const apiKey = obj.api_key
    if (typeof apiKey !== "string" || apiKey.length === 0) return null
    const model = obj.model_id
    return {
      kind: "google",
      api_key: apiKey,
      model_id: typeof model === "string" && model.length > 0 ? model : undefined,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Backward-compat: 32a's resolveAnthropicKey shape, implemented in terms
// of resolveProvider. Used by the existing risk + narrative invocation
// paths until they switch to resolveProvider in 32-c-γ.
// ---------------------------------------------------------------------------

export type ResolvedAIKey =
  | { source: "tenant"; key: string }
  | { source: "platform"; key: string }
  | { source: "blocked"; reason: LegacyBlockedReason }

export type LegacyBlockedReason =
  | "class3_no_tenant_key"
  | "external_ai_disabled"
  | "no_key_available"

/**
 * Legacy 32a entry point. Returns only Anthropic-shaped results; if
 * the resolver picks Ollama (e.g. for Class-3 with Ollama configured),
 * this wrapper falls through to a blocked response so legacy callers
 * route to the StubProvider rather than misinterpret an Ollama config
 * as an Anthropic API key.
 *
 * 32-c-γ will delete this wrapper once all callers use `resolveProvider`.
 */
export async function resolveAnthropicKey(args: {
  supabase: SupabaseClient
  tenantId: string
  provider: "anthropic"
  dataClass: DataClass
}): Promise<ResolvedAIKey> {
  // Risks is the historical default purpose for the legacy path.
  const purpose: AIPurpose = "risks"
  const result = await resolveProvider({
    supabase: args.supabase,
    tenantId: args.tenantId,
    purpose,
    dataClass: args.dataClass,
  })

  if (result.source === "tenant") {
    if (result.provider === "anthropic" && result.config.kind === "anthropic") {
      return { source: "tenant", key: result.config.api_key }
    }
    // Tenant chose Ollama — legacy caller can't use it. Treat as blocked.
    return { source: "blocked", reason: "class3_no_tenant_key" }
  }
  if (result.source === "platform") {
    return { source: "platform", key: result.key }
  }
  // Map new BlockedReason → legacy LegacyBlockedReason.
  const legacyReason: LegacyBlockedReason =
    result.reason === "external_ai_disabled"
      ? "external_ai_disabled"
      : result.reason === "class3_no_local_provider"
        ? "class3_no_tenant_key"
        : "no_key_available"
  return { source: "blocked", reason: legacyReason }
}
