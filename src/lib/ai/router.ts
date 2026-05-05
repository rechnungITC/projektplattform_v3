/**
 * PROJ-12 — model router with Class-3 hard block.
 *
 * Single entry point for risk-suggestion generation. The router:
 *   1. Classifies the auto-context payload (defense-in-depth on top of
 *      the curated allowlist that already excludes Class-3 fields).
 *   2. Decides which provider to use:
 *      - external (Anthropic) only if Class is 1 or 2 AND
 *        EXTERNAL_AI_DISABLED is not set AND ANTHROPIC_API_KEY is present.
 *      - otherwise local (Stub for now; Ollama in a later iteration).
 *   3. Logs every invocation as a `ki_runs` row — including blocked
 *      attempts (status='external_blocked') and errors (status='error').
 *      A successful run that was forced local for privacy reasons is
 *      logged as 'external_blocked' so audits can see the block worked.
 *   4. Persists each generated suggestion as a `ki_suggestions` row.
 *
 * No bypass for Class-3: the spec requires that even tenant admins
 * cannot override. There is no kwarg / setting / flag here that lets
 * callers force external routing on Class-3 data.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { isExternalAIBlocked } from "@/lib/operation-mode"
import type {
  AiProviderConfig,
  DataClass as TenantDataClass,
  PrivacyDefaults,
} from "@/types/tenant-settings"

import {
  classifyNarrativeAutoContext,
  classifyRiskAutoContext,
} from "./classify"
import { resolveProvider, type ResolvedProvider } from "./key-resolver"
import { AnthropicProvider } from "./providers/anthropic"
import { GoogleProvider } from "./providers/google"
import { OllamaProvider } from "./providers/ollama"
import { OpenAIProvider } from "./providers/openai"
import { StubProvider } from "./providers/stub"
import type { AIProvider } from "./providers/types"
import type {
  AIProviderName,
  AIPurpose,
  DataClass,
  NarrativeAutoContext,
  RiskAutoContext,
  RiskSuggestion,
  RouterNarrativeResult,
  RouterRiskResult,
} from "./types"

interface InvokeRiskGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: RiskAutoContext
  count: number
}

interface ProviderChoice {
  provider: AIProvider
  externalBlocked: boolean
}

interface TenantOverrides {
  privacyDefault: TenantDataClass
  providerConfig: AiProviderConfig
}

const DEFAULT_TENANT_OVERRIDES: TenantOverrides = {
  privacyDefault: 3,
  providerConfig: { external_provider: "none" },
}

async function loadTenantOverrides(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantOverrides> {
  const { data } = await supabase
    .from("tenant_settings")
    .select("privacy_defaults, ai_provider_config")
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (!data) return DEFAULT_TENANT_OVERRIDES

  const privacy = data.privacy_defaults as PrivacyDefaults | null
  const provider = data.ai_provider_config as AiProviderConfig | null
  return {
    privacyDefault: privacy?.default_class ?? 3,
    providerConfig: provider ?? { external_provider: "none" },
  }
}

async function selectProviderForPurpose(
  supabase: SupabaseClient,
  tenantId: string,
  purpose: AIPurpose,
  classification: DataClass,
  tenantConfig: AiProviderConfig,
): Promise<ProviderChoice> {
  // `externalBlocked` semantics: the run *wanted* to go external but was
  // blocked. That's the case for env-level kill-switch (EXTERNAL_AI_DISABLED)
  // and Class-3 payloads. A tenant config of external_provider='none' is a
  // deliberate config choice — not a block — so it doesn't flip this flag.
  //
  // 32-c-β: the resolver now returns a discriminated union with
  // {tenant, ollama|anthropic, config} | {platform, anthropic, key} |
  // {blocked, reason}. The router maps each shape to a Provider class.
  if (tenantConfig.external_provider === "none") {
    const externalDisabledByEnv = isExternalAIBlocked()
    const externalDisabledByClass = classification === 3
    return {
      provider: new StubProvider(),
      externalBlocked: externalDisabledByEnv || externalDisabledByClass,
    }
  }

  const resolved: ResolvedProvider = await resolveProvider({
    supabase,
    tenantId,
    purpose,
    dataClass: classification,
  })

  if (resolved.source === "blocked") {
    return {
      provider: new StubProvider(),
      externalBlocked:
        resolved.reason === "external_ai_disabled" ||
        resolved.reason === "class3_no_local_provider",
    }
  }

  if (resolved.source === "platform") {
    // Platform-key path is always Anthropic.
    return {
      provider: new AnthropicProvider(tenantConfig.model_id, resolved.key),
      externalBlocked: false,
    }
  }

  // Tenant-source — dispatch by provider kind.
  if (resolved.config.kind === "anthropic") {
    return {
      provider: new AnthropicProvider(
        tenantConfig.model_id,
        resolved.config.api_key,
      ),
      externalBlocked: false,
    }
  }
  if (resolved.config.kind === "ollama") {
    return {
      provider: new OllamaProvider({
        endpointUrl: resolved.config.endpoint_url,
        modelId: resolved.config.model_id,
        bearerToken: resolved.config.bearer_token,
      }),
      // Ollama on tenant infrastructure is NOT externalBlocked — data
      // does not leave the tenant control domain. ki_runs.status='success'.
      externalBlocked: false,
    }
  }
  if (resolved.config.kind === "openai") {
    return {
      provider: new OpenAIProvider({
        apiKey: resolved.config.api_key,
        modelId: resolved.config.model_id,
      }),
      externalBlocked: false,
    }
  }
  if (resolved.config.kind === "google") {
    return {
      provider: new GoogleProvider({
        apiKey: resolved.config.api_key,
        modelId: resolved.config.model_id,
      }),
      externalBlocked: false,
    }
  }
  // Should be unreachable (TS narrowing covers all union arms).
  return {
    provider: new StubProvider(),
    externalBlocked: false,
  }
}

/** Shared helper: insert a `ki_runs` row up-front (PROJ-12 + PROJ-30). */
async function insertKiRun(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    projectId: string
    actorUserId: string
    purpose: AIPurpose
    classification: DataClass
    provider: AIProvider
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("ki_runs")
    .insert({
      tenant_id: args.tenantId,
      project_id: args.projectId,
      actor_user_id: args.actorUserId,
      purpose: args.purpose,
      classification: args.classification,
      provider: args.provider.name,
      model_id: args.provider.modelId,
      status: "success", // optimistic; updated on error path
    })
    .select("id")
    .single()
  if (error || !data) {
    throw new Error(
      `ki_runs insert failed: ${error?.message ?? "unknown error"}`,
    )
  }
  return data.id as string
}

/** Shared helper: finalize a `ki_runs` row with status + token counts. */
async function updateKiRunStatus(
  supabase: SupabaseClient,
  runId: string,
  fields: {
    status: "success" | "error" | "external_blocked"
    inputTokens: number | null
    outputTokens: number | null
    latencyMs: number | null
    errorMessage: string | null
  },
): Promise<void> {
  await supabase
    .from("ki_runs")
    .update({
      status: fields.status,
      input_tokens: fields.inputTokens,
      output_tokens: fields.outputTokens,
      latency_ms: fields.latencyMs,
      error_message: fields.errorMessage,
    })
    .eq("id", runId)
}

export async function invokeRiskGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
  count,
}: InvokeRiskGenerationArgs): Promise<RouterRiskResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyRiskAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const { provider, externalBlocked } = await selectProviderForPurpose(
    supabase,
    tenantId,
    "risks",
    classification,
    overrides.providerConfig,
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "risks",
    classification,
    provider,
  })

  let suggestions: RiskSuggestion[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null

  try {
    if (!provider.generateRiskSuggestions) {
      throw new Error(
        `Provider ${provider.name} does not implement generateRiskSuggestions`,
      )
    }
    const result = await provider.generateRiskSuggestions({ context, count })
    suggestions = result.suggestions
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked) {
    finalStatus = "external_blocked"
  } else {
    finalStatus = "success"
  }

  let suggestionIds: string[] = []
  if (suggestions.length > 0) {
    const { data: sugRows, error: sugErr } = await supabase
      .from("ki_suggestions")
      .insert(
        suggestions.map((s) => ({
          tenant_id: tenantId,
          project_id: projectId,
          ki_run_id: runId,
          purpose: "risks",
          payload: s,
          original_payload: s,
          status: "draft",
          created_by: actorUserId,
        })),
      )
      .select("id")
    if (sugErr || !sugRows) {
      providerError =
        providerError ??
        `ki_suggestions insert failed: ${sugErr?.message ?? "unknown"}`
      finalStatus = "error"
    } else {
      suggestionIds = sugRows.map((r) => r.id as string)
    }
  }

  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: providerError,
  })

  return {
    run_id: runId,
    classification,
    provider: provider.name as AIProviderName,
    model_id: provider.modelId,
    status: finalStatus,
    suggestion_ids: suggestionIds,
    external_blocked: externalBlocked,
    error_message: providerError ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// PROJ-30 — narrative-purpose router
// ---------------------------------------------------------------------------

interface InvokeNarrativeGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: NarrativeAutoContext
}

/**
 * PROJ-30 — generate a 3-sentence narrative for the PROJ-21 KI-Kurzfazit.
 *
 * Mirrors `invokeRiskGeneration` but:
 *   - calls `provider.generateNarrative` instead of risk-suggestions
 *   - never writes to `ki_suggestions` (narrative is transient)
 *   - on provider error: returns the StubProvider's deterministic
 *     fallback text (status='error') so the UI never sees a 5xx
 *
 * Class-3 hard-block + tenant-config-respect inherit from
 * `selectProvider`. The whitelist-based `classifyNarrativeAutoContext`
 * is the second defense line that catches accidental Class-3 leaks
 * into the auto-context shape.
 */
export async function invokeNarrativeGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
}: InvokeNarrativeGenerationArgs): Promise<RouterNarrativeResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyNarrativeAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const { provider, externalBlocked } = await selectProviderForPurpose(
    supabase,
    tenantId,
    "narrative",
    classification,
    overrides.providerConfig,
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "narrative",
    classification,
    provider,
  })

  let text = ""
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null

  try {
    if (!provider.generateNarrative) {
      throw new Error(
        `Provider ${provider.name} does not implement generateNarrative`,
      )
    }
    const result = await provider.generateNarrative({ context })
    text = result.text
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    // Final defense: synthesize stub text so callers never see an empty
    // narrative. The Stub provider produces deterministic fallback for
    // both snapshot kinds. Any error in the Stub itself bubbles up
    // (truly broken environment).
    const fallback = await new StubProvider().generateNarrative({ context })
    text = fallback.text
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked) {
    finalStatus = "external_blocked"
  } else {
    finalStatus = "success"
  }

  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: providerError,
  })

  return {
    run_id: runId,
    classification,
    provider: provider.name as AIProviderName,
    model_id: provider.modelId,
    status: finalStatus,
    text,
    external_blocked: externalBlocked,
    error_message: providerError ?? undefined,
  }
}
