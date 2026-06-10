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
  classifyCoachingAutoContext,
  classifyCrossProjectLinksAutoContext,
  classifyNarrativeAutoContext,
  classifyProposalFromContextAutoContext,
  classifyStakeholderProposalsAutoContext,
  classifyResourceSwapAutoContext,
  classifyRiskAutoContext,
  classifySentimentAutoContext,
  classifyTrajectorySequenceAutoContext,
} from "./classify"
import { checkCostCap } from "./cost-cap"
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
  CoachingAutoContext,
  CoachingRecommendation,
  CrossProjectLinkSuggestion,
  CrossProjectLinkSuggestionPersisted,
  CrossProjectLinksAutoContext,
  DataClass,
  NarrativeAutoContext,
  ProposalFromContextAutoContext,
  ProposalFromContextSuggestion,
  RiskAutoContext,
  RiskSuggestion,
  RouterCoachingResult,
  RouterCrossProjectLinksResult,
  RouterNarrativeResult,
  RouterProposalFromContextResult,
  RouterStakeholderProposalsResult,
  StakeholderProposalsAutoContext,
  StakeholderProposalSuggestion,
  ResourceSwapAutoContext,
  ResourceSwapSuggestion,
  RouterResourceSwapResult,
  RouterRiskResult,
  RouterSentimentResult,
  RouterTrajectorySequenceResult,
  SentimentAutoContext,
  SentimentSignal,
  TrajectorySequenceAutoContext,
  TrajectorySequenceSuggestion,
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
  /** When set, the call was blocked for a non-routing reason (e.g. cost cap). */
  blockedReason?: string
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

/**
 * 32-d cost-cap gate. Called between provider selection and provider
 * invocation. If the tenant's monthly token usage has hit the configured
 * cap (cap_action='block'), swap the chosen provider for the StubProvider
 * and flag externalBlocked + blockedReason. Skips the cap check when the
 * already-selected provider is the StubProvider (nothing external to gate).
 */
async function applyCostCap(
  supabase: SupabaseClient,
  tenantId: string,
  choice: ProviderChoice,
  purpose: AIPurpose,
): Promise<ProviderChoice> {
  if (choice.provider.name === "stub") return choice
  const cap = await checkCostCap({ supabase, tenantId, purpose })
  if (!cap.blocked) {
    if (cap.warn && cap.detail) {
      // Soft warning: the call still goes through, but log the detail
      // so the run's error_message reflects the warn state.
      return { ...choice, blockedReason: `WARN: ${cap.detail}` }
    }
    return choice
  }
  return {
    provider: new StubProvider(),
    externalBlocked: true,
    blockedReason: cap.detail ?? "Monthly token cap exceeded.",
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
    provider?: AIProvider
  },
): Promise<void> {
  const updatePayload: {
    status: "success" | "error" | "external_blocked"
    input_tokens: number | null
    output_tokens: number | null
    latency_ms: number | null
    error_message: string | null
    provider?: string
    model_id?: string | null
  } = {
    status: fields.status,
    input_tokens: fields.inputTokens,
    output_tokens: fields.outputTokens,
    latency_ms: fields.latencyMs,
    error_message: fields.errorMessage,
  }
  if (fields.provider) {
    updatePayload.provider = fields.provider.name
    updatePayload.model_id = fields.provider.modelId
  }
  await supabase.from("ki_runs").update(updatePayload).eq("id", runId)
}

function isProviderCapacityError(message: string): boolean {
  const normalized = message.toLowerCase()
  return [
    "quota",
    "billing",
    "rate limit",
    "rate_limit",
    "rate-limited",
    "insufficient_quota",
    "429",
  ].some((marker) => normalized.includes(marker))
}

function buildRiskFallbackMessage(provider: AIProvider, error: string): string {
  return `Provider ${provider.name} ist wegen Kontingent, Billing oder Rate-Limit nicht verfügbar. Lokaler Stub-Fallback verwendet. Ursache: ${error}`
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
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "risks",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "risks",
  )
  let activeProvider = provider

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
  let providerFallbackMessage: string | null = null

  try {
    if (!activeProvider.generateRiskSuggestions) {
      throw new Error(
        `Provider ${activeProvider.name} does not implement generateRiskSuggestions`,
      )
    }
    const result = await activeProvider.generateRiskSuggestions({ context, count })
    suggestions = result.suggestions
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    if (
      activeProvider.name !== "stub" &&
      isProviderCapacityError(providerError)
    ) {
      const fallbackProvider = new StubProvider()
      const fallback = await fallbackProvider.generateRiskSuggestions({
        context,
        count,
      })
      providerFallbackMessage = buildRiskFallbackMessage(
        activeProvider,
        providerError,
      )
      activeProvider = fallbackProvider
      suggestions = fallback.suggestions
      inputTokens = fallback.usage.input_tokens
      outputTokens = fallback.usage.output_tokens
      latencyMs = fallback.usage.latency_ms
      providerError = null
    }
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked || providerFallbackMessage) {
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

  const finalErrorMessage =
    providerError ?? providerFallbackMessage ?? blockedReason ?? null
  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: finalErrorMessage,
    provider: activeProvider,
  })

  return {
    run_id: runId,
    classification,
    provider: activeProvider.name as AIProviderName,
    model_id: activeProvider.modelId,
    status: finalStatus,
    suggestion_ids: suggestionIds,
    external_blocked: externalBlocked || providerFallbackMessage !== null,
    error_message: finalErrorMessage ?? undefined,
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
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "narrative",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "narrative",
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
    errorMessage: providerError ?? blockedReason ?? null,
  })

  return {
    run_id: runId,
    classification,
    provider: provider.name as AIProviderName,
    model_id: provider.modelId,
    status: finalStatus,
    text,
    external_blocked: externalBlocked,
    error_message: providerError ?? blockedReason ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// PROJ-34-γ.1 — sentiment-purpose router
// ---------------------------------------------------------------------------

interface InvokeSentimentGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: SentimentAutoContext
}

/**
 * PROJ-34-γ.1 — generate per-participant sentiment + cooperation signals
 * for an interaction summary.
 *
 * Class-3 hard-fixed per CIA-L1 — `classifySentimentAutoContext` always
 * returns 3, so the router will only ever pick a tenant-supplied local
 * provider or the deterministic Stub. The Stub emits neutral signals
 * (0/0, confidence 0.3) so the downstream review queue still requires
 * human accept/reject.
 *
 * Mirrors `invokeNarrativeGeneration`:
 *   - calls `provider.generateSentiment`
 *   - never writes to `ki_suggestions` (signals land on the
 *     `stakeholder_interaction_participants` bridge via the route handler)
 *   - on provider error: falls back to the StubProvider so the UI never
 *     sees a 5xx
 */
export async function invokeSentimentGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
}: InvokeSentimentGenerationArgs): Promise<RouterSentimentResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifySentimentAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "sentiment",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "sentiment",
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "sentiment",
    classification,
    provider,
  })

  let signals: SentimentSignal[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null

  try {
    if (!provider.generateSentiment) {
      throw new Error(
        `Provider ${provider.name} does not implement generateSentiment`,
      )
    }
    const result = await provider.generateSentiment({ context })
    signals = result.signals
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    // Final defense — synthesize neutral signals via the Stub so callers
    // never see an empty response.
    const fallback = await new StubProvider().generateSentiment!({ context })
    signals = fallback.signals
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
    errorMessage: providerError ?? blockedReason ?? null,
  })

  return {
    run_id: runId,
    classification,
    provider: provider.name as AIProviderName,
    model_id: provider.modelId,
    status: finalStatus,
    signals,
    external_blocked: externalBlocked,
    error_message: providerError ?? blockedReason ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// PROJ-34-ε — coaching-purpose router
// ---------------------------------------------------------------------------

interface InvokeCoachingGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: CoachingAutoContext
}

/**
 * PROJ-34-ε — generate 0..n coaching recommendations for a single
 * stakeholder.
 *
 * Class-3 hard-fixed per CIA-L1 — `classifyCoachingAutoContext` always
 * returns 3, so the router will only ever pick a tenant-supplied local
 * provider or the deterministic Stub. The Stub emits zero recommendations
 * (no neutral defaults; the UI shows the external-blocked banner so the
 * PM knows manual coaching is the only path).
 *
 * Cost-cap is purpose-scoped via the new `purpose='coaching'` row (CIA-L7,
 * with NULL-purpose fallback for tenants who haven't configured one).
 */
export async function invokeCoachingGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
}: InvokeCoachingGenerationArgs): Promise<RouterCoachingResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyCoachingAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "coaching",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "coaching",
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "coaching",
    classification,
    provider,
  })

  let recommendations: CoachingRecommendation[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null

  try {
    if (!provider.generateCoaching) {
      throw new Error(
        `Provider ${provider.name} does not implement generateCoaching`,
      )
    }
    const result = await provider.generateCoaching({ context })
    // Provider sanity-check: enforce ≤ 1 per kind contract.
    const seenKinds = new Set<string>()
    for (const r of result.recommendations) {
      if (seenKinds.has(r.kind)) continue
      seenKinds.add(r.kind)
      recommendations.push(r)
    }
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    // Final defense — Stub returns [] so the UI handles the empty state
    // rather than the caller seeing a 5xx.
    const fallback = await new StubProvider().generateCoaching!({ context })
    recommendations = fallback.recommendations
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
    errorMessage: providerError ?? blockedReason ?? null,
  })

  return {
    run_id: runId,
    classification,
    provider: provider.name as AIProviderName,
    model_id: provider.modelId,
    status: finalStatus,
    recommendations,
    external_blocked: externalBlocked,
    tonality_hint: context.tonality_hint,
    error_message: providerError ?? blockedReason ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.α — trajectory-sequence router
// ---------------------------------------------------------------------------

interface InvokeTrajectorySequenceGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: TrajectorySequenceAutoContext
  /** Soft target count (1–5); the provider may emit fewer. */
  count: number
}

/**
 * PROJ-65 ε.4.α — generate trajectory-sequence advisory suggestions.
 *
 * Mirrors `invokeRiskGeneration` (persists each suggestion as a
 * `ki_suggestions` row with `purpose='trajectory_sequence'`) but:
 *   - context classifier is the whitelist-based
 *     `classifyTrajectorySequenceAutoContext` (Class-2 by design)
 *   - calls `provider.generateTrajectorySequence`; falls back to
 *     `StubProvider.generateTrajectorySequence` if the chosen provider
 *     does not implement it (e.g. Ollama / Google in their current state)
 *   - cost-cap purpose is `'trajectory_sequence'`
 *
 * Class-3 hard-block is inherited from `selectProvider`: if a future
 * shape change leaks a Class-3 field into the context, the classifier
 * forces local routing automatically.
 *
 * Note: the suggestions are advisory — accept marks them so without
 * triggering a downstream entity create (the relaxed
 * `ki_suggestions_accepted_consistency` CHECK allows this).
 */
export async function invokeTrajectorySequenceGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
  count,
}: InvokeTrajectorySequenceGenerationArgs): Promise<RouterTrajectorySequenceResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyTrajectorySequenceAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "trajectory_sequence",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "trajectory_sequence",
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "trajectory_sequence",
    classification,
    provider,
  })

  let activeProvider: AIProvider = provider
  let suggestions: TrajectorySequenceSuggestion[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null
  let providerFallbackMessage: string | null = null

  try {
    if (!provider.generateTrajectorySequence) {
      throw new Error(
        `Provider ${provider.name} does not implement generateTrajectorySequence`,
      )
    }
    const result = await provider.generateTrajectorySequence({ context, count })
    suggestions = result.suggestions
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    if (provider.name !== "stub") {
      // Fall back to Stub so the FE never sees a 5xx for this purpose.
      const fallbackProvider = new StubProvider()
      const fallback = await fallbackProvider.generateTrajectorySequence!({
        context,
        count,
      })
      providerFallbackMessage = `Provider ${provider.name} failed (${providerError}); fell back to Stub.`
      activeProvider = fallbackProvider
      suggestions = fallback.suggestions
      inputTokens = fallback.usage.input_tokens
      outputTokens = fallback.usage.output_tokens
      latencyMs = fallback.usage.latency_ms
      providerError = null
    }
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked || providerFallbackMessage) {
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
          purpose: "trajectory_sequence",
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

  const finalErrorMessage =
    providerError ?? providerFallbackMessage ?? blockedReason ?? null
  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: finalErrorMessage,
    provider: activeProvider,
  })

  return {
    run_id: runId,
    classification,
    provider: activeProvider.name as AIProviderName,
    model_id: activeProvider.modelId,
    status: finalStatus,
    suggestion_ids: suggestionIds,
    external_blocked: externalBlocked || providerFallbackMessage !== null,
    error_message: finalErrorMessage ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.β — resource-swap router (Class-3 hard-fix, Ollama-only)
// ---------------------------------------------------------------------------

interface InvokeResourceSwapGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: ResourceSwapAutoContext
  /** Soft target count (1–5); the provider may emit fewer. */
  count: number
}

/**
 * PROJ-65 ε.4.β — generate resource-swap suggestions.
 *
 * Class-3 hard-fixed via `classifyResourceSwapAutoContext`. The router
 * therefore only ever picks a tenant-supplied Ollama (CIA-L1: tenant
 * provider mandate) or the Stub. Anthropic / OpenAI / Google are never
 * reached on this code path.
 *
 * Provider-error semantics (CIA-L2, **strict**, differs from coaching):
 *   - If the chosen provider is Ollama and it throws, we do NOT fall back
 *     to the Stub. Instead we surface `status='external_blocked'` with
 *     the Ollama error message and emit zero suggestions. This makes the
 *     local-provider failure mode visible to the user — they see "kein
 *     lokaler Provider verfügbar" rather than silently getting an empty
 *     Stub output that looks like "no recommendation".
 *   - If the chosen provider is already the Stub (tenant has no Ollama
 *     configured), the Stub emits zero suggestions deterministically and
 *     status='external_blocked' to signal "no local provider available".
 *
 * No Anthropic / OpenAI / Google path. No Class-2 bypass.
 */
export async function invokeResourceSwapGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
  count,
}: InvokeResourceSwapGenerationArgs): Promise<RouterResourceSwapResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyResourceSwapAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "resource_swap",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "resource_swap",
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "resource_swap",
    classification,
    provider,
  })

  let suggestions: ResourceSwapSuggestion[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null
  // CIA-L2: capture Ollama error as the public "external_blocked" reason
  // (do NOT fall back to Stub on Ollama failure — make it visible).
  let ollamaError: string | null = null

  try {
    if (!provider.generateResourceSwap) {
      throw new Error(
        `Provider ${provider.name} does not implement generateResourceSwap`,
      )
    }
    const result = await provider.generateResourceSwap({ context, count })
    suggestions = result.suggestions
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (provider.name === "ollama") {
      // CIA-L2: NO Stub fallback for Ollama errors. Surface as external_blocked.
      ollamaError = message
      suggestions = []
    } else {
      providerError = message
    }
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked || ollamaError || provider.name === "stub") {
    // Stub-path always means "no local provider" for this purpose.
    finalStatus = "external_blocked"
  } else {
    finalStatus = "success"
  }

  // Enrich the payload with display labels (resource names + work-item
  // title) so the FE can render the card without extra round-trips. The
  // raw IDs stay so the "Im Swap-Preview öffnen"-button keeps the route
  // params it needs.
  const workItemTitleById = new Map(
    context.work_items.map((w) => [w.work_item_id, w.title]),
  )
  const resourceNameById = new Map<string, string>()
  for (const c of context.candidate_resources) {
    resourceNameById.set(c.resource_id, c.stakeholder_name ?? c.display_name)
  }
  for (const w of context.work_items) {
    for (const a of w.current_assignees) {
      if (!resourceNameById.has(a.resource_id)) {
        resourceNameById.set(a.resource_id, a.stakeholder_name ?? a.display_name)
      }
    }
  }
  const enrichedSuggestions = suggestions.map((s) => ({
    ...s,
    display: {
      work_item_title: workItemTitleById.get(s.work_item_id) ?? null,
      from_resource_name: resourceNameById.get(s.from_resource_id) ?? null,
      to_resource_name: resourceNameById.get(s.to_resource_id) ?? null,
    },
  }))

  let suggestionIds: string[] = []
  if (enrichedSuggestions.length > 0) {
    const { data: sugRows, error: sugErr } = await supabase
      .from("ki_suggestions")
      .insert(
        enrichedSuggestions.map((s) => ({
          tenant_id: tenantId,
          project_id: projectId,
          ki_run_id: runId,
          purpose: "resource_swap",
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

  const finalErrorMessage =
    providerError ?? ollamaError ?? blockedReason ?? null
  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: finalErrorMessage,
    provider,
  })

  return {
    run_id: runId,
    classification,
    provider: provider.name as AIProviderName,
    model_id: provider.modelId,
    status: finalStatus,
    suggestion_ids: suggestionIds,
    external_blocked: externalBlocked || ollamaError !== null || provider.name === "stub",
    error_message: finalErrorMessage ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.γ — cross-project-links router
// ---------------------------------------------------------------------------

interface InvokeCrossProjectLinksGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: CrossProjectLinksAutoContext
  /** Soft target count (1–5); the provider may emit fewer. */
  count: number
}

/**
 * PROJ-65 ε.4.γ — generate cross-project-link advisory suggestions.
 *
 * Mirrors `invokeTrajectorySequenceGeneration` (Class-2 advisory) but for
 * cross-project link suggestions:
 *   - context classifier is `classifyCrossProjectLinksAutoContext`
 *     (whitelist-based, Class-2 by design)
 *   - falls back to `StubProvider.generateCrossProjectLinks` on provider
 *     error so the FE never sees a 5xx for this purpose
 *   - cost-cap purpose is `'cross_project_links'`
 *
 * The router enriches each suggestion with denormalised titles + project
 * name so the FE can render the drawer card without extra round-trips.
 * Accept is advisory — the relaxed `ki_suggestions_accepted_consistency`
 * CHECK (eps4c migration) admits `status='accepted'` without an entity
 * link; the user creates the actual link via PROJ-27's existing dialog.
 */
export async function invokeCrossProjectLinksGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
  count,
}: InvokeCrossProjectLinksGenerationArgs): Promise<RouterCrossProjectLinksResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyCrossProjectLinksAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "cross_project_links",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "cross_project_links",
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "cross_project_links",
    classification,
    provider,
  })

  let activeProvider: AIProvider = provider
  let suggestions: CrossProjectLinkSuggestion[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null
  let providerFallbackMessage: string | null = null

  try {
    if (!provider.generateCrossProjectLinks) {
      throw new Error(
        `Provider ${provider.name} does not implement generateCrossProjectLinks`,
      )
    }
    const result = await provider.generateCrossProjectLinks({ context, count })
    suggestions = result.suggestions
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    if (provider.name !== "stub") {
      // Fall back to Stub so the FE never sees a 5xx for this purpose.
      const fallbackProvider = new StubProvider()
      const fallback = await fallbackProvider.generateCrossProjectLinks!({
        context,
        count,
      })
      providerFallbackMessage = `Provider ${provider.name} failed (${providerError}); fell back to Stub.`
      activeProvider = fallbackProvider
      suggestions = fallback.suggestions
      inputTokens = fallback.usage.input_tokens
      outputTokens = fallback.usage.output_tokens
      latencyMs = fallback.usage.latency_ms
      providerError = null
    }
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked || providerFallbackMessage) {
    finalStatus = "external_blocked"
  } else {
    finalStatus = "success"
  }

  // Enrich payload with denormalised display labels (work-item titles +
  // project names) so the FE can render the drawer card without extra
  // round-trips. The raw IDs stay so the "Im Link-Dialog öffnen"-button
  // keeps the deeplink params it needs.
  const workItemTitleById = new Map<string, string>()
  for (const w of context.source_work_items) {
    workItemTitleById.set(w.work_item_id, w.title)
  }
  for (const w of context.related_work_items) {
    workItemTitleById.set(w.work_item_id, w.title)
  }
  const projectNameById = new Map<string, string>()
  projectNameById.set(
    context.source_project.project_id,
    context.source_project.name,
  )
  for (const p of context.related_projects) {
    projectNameById.set(p.project_id, p.name)
  }
  const enrichedSuggestions: CrossProjectLinkSuggestionPersisted[] = suggestions.map((s) => ({
    ...s,
    display: {
      from_work_item_title: workItemTitleById.get(s.from_work_item_id) ?? null,
      to_work_item_title: s.to_work_item_id
        ? workItemTitleById.get(s.to_work_item_id) ?? null
        : null,
      to_project_name: projectNameById.get(s.to_project_id) ?? null,
      source_project_name: context.source_project.name,
    },
  }))

  let suggestionIds: string[] = []
  if (enrichedSuggestions.length > 0) {
    const { data: sugRows, error: sugErr } = await supabase
      .from("ki_suggestions")
      .insert(
        enrichedSuggestions.map((s) => ({
          tenant_id: tenantId,
          project_id: projectId,
          ki_run_id: runId,
          purpose: "cross_project_links",
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

  const finalErrorMessage =
    providerError ?? providerFallbackMessage ?? blockedReason ?? null
  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: finalErrorMessage,
    provider: activeProvider,
  })

  return {
    run_id: runId,
    classification,
    provider: activeProvider.name as AIProviderName,
    model_id: activeProvider.modelId,
    status: finalStatus,
    suggestion_ids: suggestionIds,
    external_blocked: externalBlocked || providerFallbackMessage !== null,
    error_message: finalErrorMessage ?? undefined,
  }
}

// ---------------------------------------------------------------------------
// PROJ-70-α — proposal-from-context router
// ---------------------------------------------------------------------------

interface InvokeProposalFromContextGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: ProposalFromContextAutoContext
  /** Soft target count (1–50); the provider may emit fewer. */
  count: number
}

/**
 * PROJ-70-α — generate proposal-from-context advisory suggestions.
 *
 * Mirrors `invokeTrajectorySequenceGeneration` (Class-2-advisory with
 * Stub-fallback) but with two distinguishing traits:
 *
 *   1. Classification is **dynamic**: depending on
 *      `classifyProposalFromContextAutoContext`'s heuristic on the
 *      uploaded `content_excerpt`, the same call site may route to
 *      Anthropic (Class-1/2) or Ollama (Class-3) — the standard
 *      `selectProviderForPurpose` machinery handles the choice.
 *
 *   2. Provider-fallback follows the trajectory pattern: if the chosen
 *      provider throws, fall back to Stub so the FE never sees a 5xx.
 *      Stub emits zero suggestions deliberately (mirror ε.4.β CIA-L5).
 *      The user sees `status='external_blocked'` + a banner.
 *
 * The accepted_consistency relaxation (migration eps4d) allows
 * `accepted_entity_*` to stay NULL on accept — the actual `work_items`
 * row gets created by the 70-β accept-pipeline, not by this router.
 */
export async function invokeProposalFromContextGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
  count,
}: InvokeProposalFromContextGenerationArgs): Promise<RouterProposalFromContextResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyProposalFromContextAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "proposal_from_context",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "proposal_from_context",
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "proposal_from_context",
    classification,
    provider,
  })

  let activeProvider: AIProvider = provider
  let suggestions: ProposalFromContextSuggestion[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null
  let providerFallbackMessage: string | null = null

  try {
    if (!provider.generateProposalFromContext) {
      throw new Error(
        `Provider ${provider.name} does not implement generateProposalFromContext`,
      )
    }
    const result = await provider.generateProposalFromContext({ context, count })
    suggestions = result.suggestions
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    if (provider.name !== "stub") {
      // Fall back to Stub so the FE never sees a 5xx for this purpose.
      // Stub emits zero suggestions by design (mirror ε.4.β CIA-L5).
      const fallbackProvider = new StubProvider()
      const fallback = await fallbackProvider.generateProposalFromContext!({
        context,
        count,
      })
      providerFallbackMessage = `Provider ${provider.name} failed (${providerError}); fell back to Stub.`
      activeProvider = fallbackProvider
      suggestions = fallback.suggestions
      inputTokens = fallback.usage.input_tokens
      outputTokens = fallback.usage.output_tokens
      latencyMs = fallback.usage.latency_ms
      providerError = null
    }
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked || providerFallbackMessage) {
    finalStatus = "external_blocked"
  } else {
    finalStatus = "success"
  }

  // Enrich each suggestion with display labels (project name + context
  // source title + normalised method hint) so the 70-β review-drawer
  // renders without extra round-trips. Raw temp_id chains stay intact.
  const enrichedSuggestions: ProposalFromContextSuggestion[] = suggestions.map(
    (s) => ({
      ...s,
      display: {
        method_hint_kind: context.method_hint,
        source_project_name: context.source_project.name,
        context_source_title: context.context_source.title,
      },
    }),
  )

  let suggestionIds: string[] = []
  if (enrichedSuggestions.length > 0) {
    const { data: sugRows, error: sugErr } = await supabase
      .from("ki_suggestions")
      .insert(
        enrichedSuggestions.map((s) => ({
          tenant_id: tenantId,
          project_id: projectId,
          ki_run_id: runId,
          purpose: "proposal_from_context",
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

  const finalErrorMessage =
    providerError ?? providerFallbackMessage ?? blockedReason ?? null
  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: finalErrorMessage,
    provider: activeProvider,
  })

  return {
    run_id: runId,
    classification,
    provider: activeProvider.name as AIProviderName,
    model_id: activeProvider.modelId,
    status: finalStatus,
    suggestion_ids: suggestionIds,
    external_blocked: externalBlocked || providerFallbackMessage !== null,
    error_message: finalErrorMessage ?? undefined,
  }
}


// ---------------------------------------------------------------------------
// PROJ-88 — stakeholder-proposals router
// ---------------------------------------------------------------------------

interface InvokeStakeholderProposalsGenerationArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  actorUserId: string
  context: StakeholderProposalsAutoContext
  /** Soft target count (1-30); the provider may emit fewer. */
  count: number
}

/**
 * PROJ-88 — generate stakeholder proposals from a kickoff context source.
 *
 * Mirrors `invokeProposalFromContextGeneration` with ONE distinguishing
 * trait: classification is PINNED to Class-3 (Tech-Design L1) — the
 * classifier returns 3 unconditionally, so `selectProviderForPurpose`
 * can only ever resolve to the Class-3-eligible provider set (today
 * Ollama; PROJ-93 may add attested Trusted-EU-Processors — inherited
 * automatically through the resolver, AC-93.9).
 *
 * No Ollama configured → the standard machinery yields the Stub +
 * `external_blocked` with an actionable reason (AC-88.3). The Stub emits
 * zero suggestions by design — fabricated stakeholders would be worse
 * than none.
 */
export async function invokeStakeholderProposalsGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
  count,
}: InvokeStakeholderProposalsGenerationArgs): Promise<RouterStakeholderProposalsResult> {
  const overrides = await loadTenantOverrides(supabase, tenantId)
  const classification = classifyStakeholderProposalsAutoContext(
    context,
    overrides.privacyDefault as DataClass,
  )
  const choice = await selectProviderForPurpose(
    supabase,
    tenantId,
    "proposal_stakeholders_from_context",
    classification,
    overrides.providerConfig,
  )
  const { provider, externalBlocked, blockedReason } = await applyCostCap(
    supabase,
    tenantId,
    choice,
    "proposal_stakeholders_from_context",
  )

  const runId = await insertKiRun(supabase, {
    tenantId,
    projectId,
    actorUserId,
    purpose: "proposal_stakeholders_from_context",
    classification,
    provider,
  })

  let activeProvider: AIProvider = provider
  let suggestions: StakeholderProposalSuggestion[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null
  let providerFallbackMessage: string | null = null

  try {
    if (!provider.generateStakeholderProposals) {
      throw new Error(
        `Provider ${provider.name} does not implement generateStakeholderProposals`,
      )
    }
    const result = await provider.generateStakeholderProposals({
      context,
      count,
    })
    suggestions = result.suggestions
    inputTokens = result.usage.input_tokens
    outputTokens = result.usage.output_tokens
    latencyMs = result.usage.latency_ms
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err)
    if (provider.name !== "stub") {
      // Fall back to Stub so the FE never sees a 5xx for this purpose.
      const fallbackProvider = new StubProvider()
      const fallback = await fallbackProvider.generateStakeholderProposals!({
        context,
        count,
      })
      providerFallbackMessage = `Provider ${provider.name} failed (${providerError}); fell back to Stub.`
      activeProvider = fallbackProvider
      suggestions = fallback.suggestions
      inputTokens = fallback.usage.input_tokens
      outputTokens = fallback.usage.output_tokens
      latencyMs = fallback.usage.latency_ms
      providerError = null
    }
  }

  let finalStatus: "success" | "error" | "external_blocked"
  if (providerError) {
    finalStatus = "error"
  } else if (externalBlocked || providerFallbackMessage) {
    finalStatus = "external_blocked"
  } else {
    finalStatus = "success"
  }

  // Display enrichment so the drawer tab renders without round-trips.
  const enrichedSuggestions: StakeholderProposalSuggestion[] = suggestions.map(
    (s) => ({
      ...s,
      display: {
        source_project_name: context.source_project.name,
        context_source_title: context.context_source.title,
      },
    }),
  )

  let suggestionIds: string[] = []
  if (enrichedSuggestions.length > 0) {
    const { data: sugRows, error: sugErr } = await supabase
      .from("ki_suggestions")
      .insert(
        enrichedSuggestions.map((s) => ({
          tenant_id: tenantId,
          project_id: projectId,
          ki_run_id: runId,
          purpose: "proposal_stakeholders_from_context",
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

  const finalErrorMessage =
    providerError ?? providerFallbackMessage ?? blockedReason ?? null
  await updateKiRunStatus(supabase, runId, {
    status: finalStatus,
    inputTokens,
    outputTokens,
    latencyMs,
    errorMessage: finalErrorMessage,
    provider: activeProvider,
  })

  return {
    run_id: runId,
    classification,
    provider: activeProvider.name as AIProviderName,
    model_id: activeProvider.modelId,
    status: finalStatus,
    suggestion_ids: suggestionIds,
    external_blocked: externalBlocked || providerFallbackMessage !== null,
    error_message: finalErrorMessage ?? undefined,
  }
}
