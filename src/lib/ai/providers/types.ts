/**
 * PROJ-12 + PROJ-30 — provider strategy interface.
 *
 * Each provider implementation knows how to turn a project context into
 * AI output. The router picks one based on data classification and env
 * config. PROJ-30 generalizes the original Risk-only interface to a
 * multi-purpose `AIProvider` with optional methods per purpose.
 */

import type {
  AIProviderName,
  NarrativeAutoContext,
  NarrativeGenerationOutput,
  RiskAutoContext,
  RiskGenerationOutput,
} from "../types"

export interface RiskGenerationRequest {
  context: RiskAutoContext
  /** Number of suggestions to ask for (3–10 typical). */
  count: number
}

export interface NarrativeGenerationRequest {
  context: NarrativeAutoContext
}

/**
 * PROJ-30 — generic provider interface. Methods are optional so a
 * provider can support a subset of purposes (e.g. Ollama implements
 * neither; Anthropic + Stub implement both).
 *
 * The router calls a method only after `selectProvider` has decided
 * the provider is appropriate; if a provider lacks the requested
 * method the router catches the runtime throw and falls back.
 */
export interface AIProvider {
  readonly name: AIProviderName
  readonly modelId: string | null
  generateRiskSuggestions?(
    request: RiskGenerationRequest,
  ): Promise<RiskGenerationOutput>
  generateNarrative?(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationOutput>
}

/**
 * Deprecated alias preserved so existing imports of `AIRiskProvider`
 * continue to compile. New code should use {@link AIProvider}. The
 * Risk method is required on this alias to keep backward-compat at
 * the type level.
 */
export interface AIRiskProvider extends AIProvider {
  generateRiskSuggestions(
    request: RiskGenerationRequest,
  ): Promise<RiskGenerationOutput>
}
