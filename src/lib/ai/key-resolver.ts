/**
 * PROJ-32a — AI provider key resolution.
 *
 * Single entry point that the AI router consults before every external
 * call. Returns one of three shapes:
 *
 *   { source: 'tenant',   key: <decrypted> }   — tenant has a valid key
 *   { source: 'platform', key: <env value> }   — fall back to platform key
 *                                                 (only allowed for Class 1/2)
 *   { source: 'blocked' }                      — Class-3 + no tenant key,
 *                                                 OR external AI disabled,
 *                                                 OR no key available at all
 *
 * Routing policy (Fork 4 + Spec Block C):
 *   * Class-3 demands a Tenant-Key. No platform fallback for Class-3 ever.
 *   * Class-1/2 prefer Tenant-Key when set, else fall back to platform key,
 *     else blocked (graceful: router routes to local stub).
 *
 * Caching (Fork 4 lock):
 *   * `React.cache()` wraps the lookup so multi-step AI invocations within
 *     a single Server-Component / Route-Handler request decrypt at most
 *     once. The cache is per-request and per-(tenant, provider) pair.
 *   * Cross-request caching is explicitly NOT done — plaintext key would
 *     live longer than necessary in process memory.
 *
 * Server-only: this file MUST NOT be imported from client components.
 * Plaintext key material flows through it.
 */

import { cache } from "react"

import type { SupabaseClient } from "@supabase/supabase-js"

import { isExternalAIBlocked } from "@/lib/operation-mode"

import type { DataClass } from "./types"

export type AIKeyProvider = "anthropic"

export type ResolvedAIKey =
  | { source: "tenant"; key: string }
  | { source: "platform"; key: string }
  | { source: "blocked"; reason: BlockedReason }

export type BlockedReason =
  | "class3_no_tenant_key"
  | "external_ai_disabled"
  | "no_key_available"

interface ResolveArgs {
  supabase: SupabaseClient
  tenantId: string
  provider: AIKeyProvider
  dataClass: DataClass
}

/**
 * Per-request cached lookup of the decrypted tenant key (or null when not
 * set). The cache key is the plain string `${tenantId}:${provider}` —
 * SupabaseClient identity is not part of the key, but per-request
 * routing always uses one client, so the cache stays consistent.
 *
 * Throws on RPC errors so callers can distinguish "no key" (returns null)
 * from "encryption broken" (throws).
 */
const cachedDecrypt = cache(
  async (
    supabase: SupabaseClient,
    tenantId: string,
    provider: AIKeyProvider,
  ): Promise<string | null> => {
    const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY
    if (!encryptionKey) {
      // Tenant key cannot be decrypted without the env var. Treat as
      // "no tenant key" and let the platform fallback / Class-3 block
      // logic kick in. Logging it loudly so ops sees the misconfig.
      console.error(
        "[key-resolver] SECRETS_ENCRYPTION_KEY env var is not set — " +
          "tenant AI keys are unreadable. Falling back to platform key.",
      )
      return null
    }

    const { error: gucErr } = await supabase.rpc("set_session_encryption_key", {
      p_key: encryptionKey,
    })
    if (gucErr) {
      throw new Error(
        `set_session_encryption_key failed: ${gucErr.message}`,
      )
    }

    const { data, error } = await supabase.rpc("decrypt_tenant_ai_key", {
      p_tenant_id: tenantId,
      p_provider: provider,
    })
    if (error) {
      throw new Error(`decrypt_tenant_ai_key failed: ${error.message}`)
    }
    return (data as string | null) ?? null
  },
)

/**
 * Resolve which Anthropic key to use for a given (tenant, dataClass).
 *
 * Caller contract:
 *   * Pass the same SupabaseClient you'd use for any DB call in this
 *     request — it must be authenticated as a tenant member.
 *   * For Class-3, only `{ source: 'tenant' }` is acceptable.
 *   * For Class-1/2, `{ source: 'platform' }` is acceptable as fallback.
 *   * `{ source: 'blocked' }` means: the AI router MUST route locally
 *     (StubProvider) or refuse the call.
 *
 * Notes:
 *   * `EXTERNAL_AI_DISABLED` env hard-blocks all external calls
 *     regardless of dataClass — this is the global kill-switch.
 *   * Plaintext is held only in memory for the lifetime of the request
 *     and is GC'ed after the route handler returns.
 */
export async function resolveAnthropicKey({
  supabase,
  tenantId,
  provider,
  dataClass,
}: ResolveArgs): Promise<ResolvedAIKey> {
  // Global kill-switch: if external AI is disabled, blocked regardless of
  // tenant key. Internal lookups via tenant key would still expose the
  // key to the process memory unnecessarily.
  if (isExternalAIBlocked()) {
    return { source: "blocked", reason: "external_ai_disabled" }
  }

  const tenantKey = await cachedDecrypt(supabase, tenantId, provider)

  if (tenantKey) {
    return { source: "tenant", key: tenantKey }
  }

  // No tenant key. Class-3 demands a tenant key — block.
  if (dataClass === 3) {
    return { source: "blocked", reason: "class3_no_tenant_key" }
  }

  // Class-1/2 fallback to platform key (env).
  const platformKey = process.env.ANTHROPIC_API_KEY
  if (platformKey) {
    return { source: "platform", key: platformKey }
  }

  // No tenant key, no platform key — graceful block. Router routes to local.
  return { source: "blocked", reason: "no_key_available" }
}
