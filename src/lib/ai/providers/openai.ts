/**
 * PROJ-32-b — OpenAI provider.
 *
 * Real OpenAI calls via the Vercel AI-SDK first-party @ai-sdk/openai
 * package. Mirrors the AnthropicProvider structure so any provider
 * produces structurally compatible output for both the `risks` and
 * `narrative` purposes.
 *
 * Default model: `gpt-4o` (reasonable middle of the road for risk +
 * narrative quality vs cost). Override via tenant config if needed.
 *
 * Class-3 implications: OpenAI is a cloud provider. Class-3-routing
 * is rejected at three layers (resolver clamp + API route + DB CHECK).
 * Only `tenant_ai_provider_priority` rows with `data_class != 3 OR
 * provider_order ⊆ {ollama}` are accepted.
 */

import { createOpenAI, openai as defaultOpenAI } from "@ai-sdk/openai"
import type { OpenAIProvider as OpenAISDKProvider } from "@ai-sdk/openai"
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

const DEFAULT_OPENAI_MODEL = "gpt-4o"

// ---------------------------------------------------------------------------
// Risk-suggestion schema + prompt (identical shape to Anthropic / Ollama).
// ---------------------------------------------------------------------------

const RiskSuggestionSchema = z.object({
  title: z.string().min(3).max(120).describe("Short, action-oriented risk title"),
  description: z
    .string()
    .max(1000)
    .describe(
      "1–3 sentence explanation of the risk in this project's context.",
    ),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigation: z
    .string()
    .max(1000)
    .describe(
      "Concrete mitigation action(s) the project lead can take. Avoid vague advice.",
    ),
})

const ResponseSchema = z.object({
  suggestions: z.array(RiskSuggestionSchema).min(1).max(10),
})

const RISK_SYSTEM_PROMPT = `You are an experienced project risk advisor.

Generate concise, project-specific risk suggestions for the project described in the user prompt.
Rules:
- Each risk must be plausibly relevant to the given project type, method, and current phase.
- Do NOT duplicate existing risks (you'll see them in the prompt).
- Avoid generic boilerplate ("project may fail", "scope creep") — be concrete.
- Probability + impact use a 1-5 scale where 5 = highest.
- Mitigation must be an actionable next step a project lead can execute.
- Respond in German if the project name and context look German; otherwise in English.
- Never include personal data, names, or contact details.`

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
    lines.push("Vorhandene Work-Items (gekürzt):")
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

// Narrative ----------------------------------------------------------------

const NarrativeResponseSchema = z.object({
  text: z.string().min(20).max(600),
})

const NARRATIVE_SYSTEM_PROMPT = `Du bist ein erfahrener Projektberater und schreibst Lenkungskreis-Kurzfazite.
Aufgabe: 3 Sätze für die Sektion "Aktueller Stand" eines Status-Reports oder einer Executive-Summary.
Pflichtregeln:
- GENAU 3 Sätze, deutsche Sprache, sachlich-professionell.
- Beziehe dich auf Phasen-Status, Top-Risiken, anstehende Meilensteine, Backlog-Stand.
- KEINE personenbezogenen Daten, KEINE Namen, KEINE Spekulation über Personen.
- Bei leerem Projekt: "Projekt im Aufbau" als ersten Satz.`

function buildNarrativePrompt(request: NarrativeGenerationRequest): string {
  const ctx = request.context
  return [
    `Snapshot-Typ: ${ctx.kind === "status_report" ? "Status-Report" : "Executive-Summary"}`,
    `Projekt: ${ctx.project.name}`,
    `Typ: ${ctx.project.project_type ?? "—"}`,
    `Methode: ${ctx.project.project_method ?? "—"}`,
    `Lifecycle: ${ctx.project.lifecycle_status}`,
    `Phasen: ${ctx.phases_summary.total} insgesamt`,
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
// OpenAIProvider class
// ---------------------------------------------------------------------------

export interface OpenAIProviderConfig {
  apiKey: string
  modelId?: string
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const
  readonly modelId: string
  private readonly sdkProvider: OpenAISDKProvider

  constructor(config?: OpenAIProviderConfig) {
    this.modelId = config?.modelId ?? DEFAULT_OPENAI_MODEL
    this.sdkProvider = config?.apiKey
      ? createOpenAI({ apiKey: config.apiKey })
      : defaultOpenAI
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
