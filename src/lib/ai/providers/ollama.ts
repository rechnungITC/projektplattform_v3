/**
 * PROJ-12 — Ollama provider (placeholder).
 *
 * Reserved for the local-LLM path that stand-alone customers will need.
 * Iteration 2 wires this against an actual Ollama HTTP server. Until
 * then, the router silently prefers the Stub provider for the local
 * path; instantiating this provider directly raises a clear error so
 * nobody accidentally points at a ghost.
 */

import type {
  AIRiskProvider,
  RiskGenerationRequest,
} from "./types"
import type { RiskGenerationOutput } from "../types"

export class OllamaRiskProvider implements AIRiskProvider {
  readonly name = "ollama" as const
  readonly modelId = process.env.OLLAMA_MODEL ?? "llama3.2:3b"

  async generateRiskSuggestions(
    _request: RiskGenerationRequest
  ): Promise<RiskGenerationOutput> {
    throw new Error(
      "OllamaRiskProvider is not implemented yet. The router falls back to Stub for local routing in this iteration."
    )
  }
}
