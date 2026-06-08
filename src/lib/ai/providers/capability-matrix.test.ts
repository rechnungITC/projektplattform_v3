/**
 * PROJ-85 — provider capability-matrix regression guard.
 *
 * The router dispatches each AI purpose to the tenant's selected provider
 * and silently falls back to the StubProvider when the provider doesn't
 * implement the method. That silent fallback hid a real gap for months
 * (OpenAI/Google lacked the PROJ-65/70 graph purposes; Ollama lacked the
 * two Class-2 graph purposes). This test pins the intended matrix so a
 * future provider regression fails loudly here instead of degrading to
 * stub output in production.
 *
 * `resource_swap` is INTENTIONALLY Ollama-only (Class-3 → tenant-local,
 * PROJ-65 ε.4.β); cloud providers must NOT implement it.
 */

import { describe, expect, it } from "vitest"

import { AnthropicProvider } from "./anthropic"
import { GoogleProvider } from "./google"
import { OllamaProvider } from "./ollama"
import { OpenAIProvider } from "./openai"
import { StubProvider } from "./stub"
import type { AIProvider } from "./types"

const anthropic = new AnthropicProvider("claude-test", "sk-test")
const openai = new OpenAIProvider({ apiKey: "sk-test", modelId: "gpt-test" })
const google = new GoogleProvider({ apiKey: "g-test", modelId: "gemini-test" })
const ollama = new OllamaProvider({
  endpointUrl: "https://ollama.test",
  modelId: "llama-test",
})
const stub = new StubProvider()

type Method =
  | "generateRiskSuggestions"
  | "generateNarrative"
  | "generateTrajectorySequence"
  | "generateCrossProjectLinks"
  | "generateProposalFromContext"
  | "generateResourceSwap"

function has(provider: AIProvider, method: Method): boolean {
  return typeof (provider as unknown as Record<string, unknown>)[method] ===
    "function"
}

describe("PROJ-85 — provider capability matrix", () => {
  it("Stub implements every purpose (router fallback target)", () => {
    for (const m of [
      "generateRiskSuggestions",
      "generateNarrative",
      "generateTrajectorySequence",
      "generateCrossProjectLinks",
      "generateProposalFromContext",
      "generateResourceSwap",
    ] as Method[]) {
      expect(has(stub, m), `stub.${m}`).toBe(true)
    }
  })

  it("cloud providers implement all non-Class-3 purposes", () => {
    for (const p of [anthropic, openai, google]) {
      for (const m of [
        "generateRiskSuggestions",
        "generateNarrative",
        "generateTrajectorySequence",
        "generateCrossProjectLinks",
        "generateProposalFromContext",
      ] as Method[]) {
        expect(has(p, m), `${p.name}.${m}`).toBe(true)
      }
    }
  })

  it("resource_swap is Ollama-only (Class-3, by design)", () => {
    expect(has(ollama, "generateResourceSwap")).toBe(true)
    expect(has(anthropic, "generateResourceSwap")).toBe(false)
    expect(has(openai, "generateResourceSwap")).toBe(false)
    expect(has(google, "generateResourceSwap")).toBe(false)
  })

  it("Ollama implements the Class-2 graph purposes (PROJ-85 fix)", () => {
    // These were the residual silent-stub gap closed by PROJ-85.
    expect(has(ollama, "generateTrajectorySequence")).toBe(true)
    expect(has(ollama, "generateCrossProjectLinks")).toBe(true)
    // …plus the purposes Ollama already had.
    expect(has(ollama, "generateProposalFromContext")).toBe(true)
    expect(has(ollama, "generateRiskSuggestions")).toBe(true)
    expect(has(ollama, "generateNarrative")).toBe(true)
  })
})
