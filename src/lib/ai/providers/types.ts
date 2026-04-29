/**
 * PROJ-12 — provider strategy interface.
 *
 * Each provider implementation knows how to turn a project context into
 * AI-generated risk suggestions. The router picks one based on data
 * classification and env config.
 */

import type {
  AIProviderName,
  RiskAutoContext,
  RiskGenerationOutput,
} from "../types"

export interface RiskGenerationRequest {
  context: RiskAutoContext
  /** Number of suggestions to ask for (3–10 typical). */
  count: number
}

export interface AIRiskProvider {
  readonly name: AIProviderName
  readonly modelId: string | null
  generateRiskSuggestions(
    request: RiskGenerationRequest
  ): Promise<RiskGenerationOutput>
}
