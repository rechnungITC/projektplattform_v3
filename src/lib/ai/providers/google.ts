/**
 * PROJ-32-b — Google AI Studio (Gemini) provider.
 *
 * Real Gemini calls via the Vercel AI-SDK first-party @ai-sdk/google
 * package. Mirrors AnthropicProvider / OpenAIProvider structure.
 *
 * Default model: `gemini-2.0-flash-exp` (current generally-available
 * snapshot at this slice's deploy date). Override via tenant config.
 *
 * Class-3 implications: Google is a cloud provider. Class-3-routing
 * is rejected at three layers (resolver clamp + API route + DB CHECK).
 *
 * API endpoint: generativelanguage.googleapis.com (Gemini API, not
 * Vertex AI). Authentication: simple API key in `x-goog-api-key`
 * header — no service-account JSON, no token refresh.
 */

import {
  createGoogleGenerativeAI,
  google as defaultGoogle,
} from "@ai-sdk/google"
import type { GoogleGenerativeAIProvider as GoogleSDKProvider } from "@ai-sdk/google"
import { generateObject } from "ai"
import { z } from "zod"

import type {
  AIProvider,
  NarrativeGenerationRequest,
  RiskGenerationRequest,
} from "./types"
import type {
  NarrativeGenerationOutput,
  RiskGenerationOutput,
} from "../types"

const DEFAULT_GOOGLE_MODEL = "gemini-2.0-flash-exp"

const RiskSuggestionSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(1000),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation: z.string().max(1000),
})

const ResponseSchema = z.object({
  suggestions: z.array(RiskSuggestionSchema).min(1).max(10),
})

const RISK_SYSTEM_PROMPT = `You are an experienced project risk advisor.

Generate concise, project-specific risk suggestions for the project described in the user prompt.
Rules:
- Each risk must be plausibly relevant to the given project type, method, and current phase.
- Do NOT duplicate existing risks (you'll see them in the prompt).
- Avoid generic boilerplate — be concrete.
- Probability + impact use a 1-5 scale where 5 = highest.
- Mitigation must be an actionable next step.
- Respond in German if the project context looks German; otherwise in English.
- Never include personal data.`

function buildRiskPrompt(request: RiskGenerationRequest): string {
  const ctx = request.context
  const lines: string[] = [
    `Projekt: ${ctx.project.name}`,
    `Typ: ${ctx.project.project_type ?? "—"}`,
    `Methode: ${ctx.project.project_method ?? "—"}`,
    `Lifecycle: ${ctx.project.lifecycle_status}`,
    "",
  ]
  if (ctx.phases.length > 0) {
    lines.push("Phasen:")
    for (const p of ctx.phases) {
      lines.push(`  - ${p.name} (${p.status})`)
    }
  }
  if (ctx.milestones.length > 0) {
    lines.push("Meilensteine:")
    for (const m of ctx.milestones) {
      lines.push(`  - ${m.name} (${m.status})`)
    }
  }
  if (ctx.work_items.length > 0) {
    lines.push("Work-Items:")
    for (const w of ctx.work_items.slice(0, 30)) {
      lines.push(`  - [${w.kind}] ${w.title} (${w.status})`)
    }
  }
  if (ctx.existing_risks.length > 0) {
    lines.push("Bereits erfasste Risiken (NICHT duplizieren):")
    for (const r of ctx.existing_risks) {
      lines.push(`  - ${r.title} (P=${r.probability}, A=${r.impact})`)
    }
  }
  lines.push(`Bitte schlage ${request.count} weitere Risiken vor.`)
  return lines.join("\n")
}

const NarrativeResponseSchema = z.object({
  text: z.string().min(20).max(600),
})

const NARRATIVE_SYSTEM_PROMPT = `Du bist ein erfahrener Projektberater und schreibst Lenkungskreis-Kurzfazite.
Aufgabe: 3 Sätze für die Sektion "Aktueller Stand" eines Status-Reports.
Pflichtregeln:
- GENAU 3 Sätze, deutsche Sprache.
- Beziehe dich auf Phasen-Status, Top-Risiken, anstehende Meilensteine.
- KEINE personenbezogenen Daten.
- Bei leerem Projekt: "Projekt im Aufbau" als ersten Satz.`

function buildNarrativePrompt(request: NarrativeGenerationRequest): string {
  const ctx = request.context
  return [
    `Snapshot-Typ: ${ctx.kind}`,
    `Projekt: ${ctx.project.name}`,
    `Typ: ${ctx.project.project_type ?? "—"}`,
    `Methode: ${ctx.project.project_method ?? "—"}`,
    `Lifecycle: ${ctx.project.lifecycle_status}`,
    `Phasen: ${ctx.phases_summary.total}`,
    ctx.top_risks.length > 0
      ? `Top-Risiken: ${ctx.top_risks.map((r) => r.title).join(", ")}`
      : "",
    ctx.upcoming_milestones.length > 0
      ? `Anstehende Meilensteine: ${ctx.upcoming_milestones.map((m) => m.name).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
}

// ---------------------------------------------------------------------------
// GoogleProvider class
// ---------------------------------------------------------------------------

export interface GoogleProviderConfig {
  apiKey: string
  modelId?: string
}

export class GoogleProvider implements AIProvider {
  readonly name = "google" as const
  readonly modelId: string
  private readonly sdkProvider: GoogleSDKProvider

  constructor(config?: GoogleProviderConfig) {
    this.modelId = config?.modelId ?? DEFAULT_GOOGLE_MODEL
    this.sdkProvider = config?.apiKey
      ? createGoogleGenerativeAI({ apiKey: config.apiKey })
      : defaultGoogle
  }

  async generateRiskSuggestions(
    request: RiskGenerationRequest,
  ): Promise<RiskGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: ResponseSchema,
      system: RISK_SYSTEM_PROMPT,
      prompt: buildRiskPrompt(request),
      temperature: 0.4,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined
    return {
      suggestions: result.object.suggestions.map((s) => ({
        title: s.title,
        description: s.description,
        probability: s.probability,
        impact: s.impact,
        status: "open" as const,
        mitigation: s.mitigation,
      })),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  async generateNarrative(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: NarrativeResponseSchema,
      system: NARRATIVE_SYSTEM_PROMPT,
      prompt: buildNarrativePrompt(request),
      temperature: 0.3,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined
    return {
      text: result.object.text,
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }
}
