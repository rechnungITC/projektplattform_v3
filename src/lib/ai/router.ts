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

import { classifyRiskAutoContext } from "./classify"
import { AnthropicRiskProvider } from "./providers/anthropic"
import { StubRiskProvider } from "./providers/stub"
import type { AIRiskProvider } from "./providers/types"
import type {
  AIProviderName,
  DataClass,
  RiskAutoContext,
  RiskSuggestion,
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
  provider: AIRiskProvider
  externalBlocked: boolean
}

function selectProvider(classification: DataClass): ProviderChoice {
  const externalDisabledByEnv = isExternalAIBlocked()
  const externalDisabledByClass = classification === 3
  const wantsExternal = !externalDisabledByEnv && !externalDisabledByClass
  const apiKeyPresent = Boolean(process.env.ANTHROPIC_API_KEY)

  if (wantsExternal && apiKeyPresent) {
    return {
      provider: new AnthropicRiskProvider(),
      externalBlocked: false,
    }
  }
  return {
    provider: new StubRiskProvider(),
    externalBlocked: externalDisabledByEnv || externalDisabledByClass,
  }
}

export async function invokeRiskGeneration({
  supabase,
  tenantId,
  projectId,
  actorUserId,
  context,
  count,
}: InvokeRiskGenerationArgs): Promise<RouterRiskResult> {
  const classification = classifyRiskAutoContext(context)
  const { provider, externalBlocked } = selectProvider(classification)

  // Insert the run row up-front so we have a stable id even if the
  // provider call fails. Status is filled in after we know the outcome.
  const { data: runRow, error: runErr } = await supabase
    .from("ki_runs")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      actor_user_id: actorUserId,
      purpose: "risks",
      classification,
      provider: provider.name,
      model_id: provider.modelId,
      status: "success", // optimistic; updated on error path below
    })
    .select("id")
    .single()

  if (runErr || !runRow) {
    throw new Error(
      `ki_runs insert failed: ${runErr?.message ?? "unknown error"}`
    )
  }
  const runId = runRow.id as string

  let suggestions: RiskSuggestion[] = []
  let inputTokens: number | null = null
  let outputTokens: number | null = null
  let latencyMs: number | null = null
  let providerError: string | null = null

  try {
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

  // Persist suggestions (only when we actually got some).
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
        }))
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

  // Update the run row with the final outcome.
  await supabase
    .from("ki_runs")
    .update({
      status: finalStatus,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      error_message: providerError,
    })
    .eq("id", runId)

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
