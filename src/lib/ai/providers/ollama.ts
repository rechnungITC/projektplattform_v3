/**
 * PROJ-12 — Ollama provider (placeholder).
 *
 * Reserved for the local-LLM path that stand-alone customers will need.
 * Iteration 2 wires this against an actual Ollama HTTP server. Until
 * then, the router silently prefers the Stub provider for the local
 * path; instantiating this provider directly raises a clear error so
 * nobody accidentally points at a ghost.
 *
 * PROJ-30: declares the narrative method as well so the type-system
 * shows Ollama is a multi-purpose provider once implemented. Both
 * methods throw today.
 */

import type {
  AIProvider,
  NarrativeGenerationRequest,
  RiskGenerationRequest,
} from "./types"
import type {
  NarrativeGenerationOutput,
  RiskGenerationOutput,
} from "../types"

export class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const
  readonly modelId = process.env.OLLAMA_MODEL ?? "llama3.2:3b"

  async generateRiskSuggestions(
    _request: RiskGenerationRequest,
  ): Promise<RiskGenerationOutput> {
    throw new Error(
      "OllamaProvider.generateRiskSuggestions is not implemented yet. The router falls back to Stub for local routing in this iteration.",
    )
  }

  async generateNarrative(
    _request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationOutput> {
    throw new Error(
      "OllamaProvider.generateNarrative is not implemented yet. The router falls back to Stub for local routing in this iteration.",
    )
  }
}

/**
 * Deprecated alias.
 */
export const OllamaRiskProvider = OllamaProvider
