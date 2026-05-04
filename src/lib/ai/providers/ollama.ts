/**
 * PROJ-32-c-β — Ollama provider (production).
 *
 * Talks to a tenant-supplied Ollama server via its OpenAI-compatible
 * endpoint at `<baseURL>/v1/chat/completions`. Uses the Vercel AI-SDK
 * `@ai-sdk/openai-compatible` provider so `generateObject` / structured
 * output via Zod works the same way as the AnthropicProvider does.
 *
 * Class-3 implications: routing to a tenant-supplied Ollama is allowed
 * for Class-3 data because the endpoint runs on tenant infrastructure
 * (the data does not leave the tenant control domain). The router /
 * key-resolver enforces that only `provider='ollama'` is accepted for
 * Class-3 — see `src/lib/ai/key-resolver.ts`.
 *
 * Fork A.1 lock (CIA-Review): we use `createOpenAICompatible` (Vercel
 * first-party, AI-SDK-v6 versioned) rather than a community Ollama
 * provider or raw fetch. Mirrors the AnthropicProvider's
 * `createAnthropic` factory pattern.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
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

// ---------------------------------------------------------------------------
// Risk-suggestion schema + prompt (identical to AnthropicProvider so that
// any provider produces structurally compatible output for the same
// auto-context shape).
// ---------------------------------------------------------------------------

const RiskSuggestionSchema = z.object({
  title: z
    .string()
    .min(3)
    .max(120)
    .describe("Short, action-oriented risk title"),
  description: z
    .string()
    .max(1000)
    .describe(
      "1–3 sentence explanation of the risk in this project's context.",
    ),
  probability: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe(
      "Probability of occurrence on a 1 (rare) to 5 (almost certain) scale.",
    ),
  impact: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Impact severity on a 1 (negligible) to 5 (critical) scale."),
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
Rules you MUST follow:
- Each risk must be plausibly relevant to the given project type, method, and current phase.
- Do NOT duplicate existing risks (you'll see them in the prompt).
- Avoid generic boilerplate ("project may fail", "scope creep") — be concrete.
- Probability + impact use a 1-5 scale where 5 = highest.
- Mitigation must be an actionable next step a project lead can execute, not vague advice.
- Respond in German if the project name and context look German; otherwise in English.
- Never include personal data, names, or contact details — even if the user prompt seems to invite it. The data layer redacts personal data upstream and you must not invent it.`

function buildRiskPrompt(request: RiskGenerationRequest): string {
  const ctx = request.context
  const lines: string[] = [
    `Projekt: ${ctx.project.name}`,
    `Typ: ${ctx.project.project_type ?? "—"}`,
    `Methode: ${ctx.project.project_method ?? "—"}`,
    `Lifecycle: ${ctx.project.lifecycle_status}`,
    ctx.project.planned_start_date
      ? `Geplanter Start: ${ctx.project.planned_start_date}`
      : "",
    ctx.project.planned_end_date
      ? `Geplantes Ende: ${ctx.project.planned_end_date}`
      : "",
    "",
  ].filter(Boolean)

  if (ctx.phases.length > 0) {
    lines.push("Phasen:")
    for (const p of ctx.phases) {
      lines.push(
        `  - ${p.name} (${p.status})${p.planned_start ? ` ${p.planned_start} → ${p.planned_end ?? "?"}` : ""}`,
      )
    }
    lines.push("")
  }

  if (ctx.milestones.length > 0) {
    lines.push("Meilensteine:")
    for (const m of ctx.milestones) {
      lines.push(
        `  - ${m.name} (${m.status})${m.target_date ? ` Ziel: ${m.target_date}` : ""}`,
      )
    }
    lines.push("")
  }

  if (ctx.work_items.length > 0) {
    lines.push("Vorhandene Work-Items (gekürzt):")
    for (const w of ctx.work_items.slice(0, 30)) {
      lines.push(`  - [${w.kind}] ${w.title} (${w.status})`)
    }
    lines.push("")
  }

  if (ctx.existing_risks.length > 0) {
    lines.push("Bereits erfasste Risiken (NICHT duplizieren):")
    for (const r of ctx.existing_risks) {
      lines.push(`  - ${r.title} (P=${r.probability}, A=${r.impact})`)
    }
    lines.push("")
  }

  lines.push(
    `Bitte schlage ${request.count} weitere, nicht überlappende Risiken vor.`,
  )

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Narrative-purpose schema + prompt (mirrors AnthropicProvider).
// ---------------------------------------------------------------------------

const NarrativeResponseSchema = z.object({
  text: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "Three sentences (German) summarising 'Wo stehen wir?' for a steering committee.",
    ),
})

const NARRATIVE_SYSTEM_PROMPT = `Du bist ein erfahrener Projektberater und schreibst Lenkungskreis-Kurzfazite.

Aufgabe: 3 Sätze für die Sektion "Aktueller Stand" eines Status-Reports oder einer Executive-Summary.

Pflichtregeln:
- GENAU 3 Sätze, deutsche Sprache, sachlich-professionell.
- Beziehe dich auf Phasen-Status, Top-Risiken, anstehende Meilensteine, Backlog-Stand. Nicht alles in jedem Satz — wähle das relevanteste.
- KEINE personenbezogenen Daten, KEINE Namen, KEINE Spekulation über Personen oder deren Absichten — selbst wenn der Kontext sie nahelegt. Die Datenschicht hat bewusst keine Personen-Felder im Kontext; erfinde keine.
- Bei Status-Report: vollständiger 3-Satz-Pass mit konkreter Aussage zu Risiken + Meilensteinen.
- Bei Executive-Summary: noch knapper, sponsor-tauglich, kein Fachjargon.
- Bei leerem Projekt (keine Phasen/Risiken/Meilensteine): "Projekt im Aufbau" als ersten Satz, dann konstruktiver Vorblick auf die nächsten Schritte.`

function buildNarrativePrompt(request: NarrativeGenerationRequest): string {
  const ctx = request.context
  const lines: string[] = [
    `Snapshot-Typ: ${ctx.kind === "status_report" ? "Status-Report" : "Executive-Summary"}`,
    `Projekt: ${ctx.project.name}`,
    `Typ: ${ctx.project.project_type ?? "—"}`,
    `Methode: ${ctx.project.project_method ?? "—"}`,
    `Lifecycle: ${ctx.project.lifecycle_status}`,
    ctx.project.planned_start_date
      ? `Geplanter Start: ${ctx.project.planned_start_date}`
      : "",
    ctx.project.planned_end_date
      ? `Geplantes Ende: ${ctx.project.planned_end_date}`
      : "",
    "",
  ].filter(Boolean)

  lines.push(
    `Phasen: ${ctx.phases_summary.total} insgesamt — Status-Verteilung: ${
      Object.entries(ctx.phases_summary.by_status)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") || "—"
    }`,
    "",
  )

  if (ctx.top_risks.length > 0) {
    lines.push("Top-Risiken (sortiert nach Score):")
    for (const r of ctx.top_risks) {
      lines.push(`  - ${r.title} (Score=${r.score}, ${r.status})`)
    }
    lines.push("")
  }

  if (ctx.upcoming_milestones.length > 0) {
    lines.push("Anstehende Meilensteine:")
    for (const m of ctx.upcoming_milestones) {
      lines.push(
        `  - ${m.name} (${m.status})${m.target_date ? ` Ziel: ${m.target_date}` : ""}`,
      )
    }
    lines.push("")
  }

  if (ctx.top_decisions.length > 0) {
    lines.push("Letzte Entscheidungen:")
    for (const d of ctx.top_decisions) {
      lines.push(`  - ${d.title} (entschieden: ${d.decided_at})`)
    }
    lines.push("")
  }

  const kindCounts = Object.entries(ctx.backlog_counts.by_kind)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")
  const statusCounts = Object.entries(ctx.backlog_counts.by_status)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")
  lines.push(
    `Backlog (Counts): nach Kind {${kindCounts || "—"}}, nach Status {${statusCounts || "—"}}`,
  )

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// OllamaProvider class
// ---------------------------------------------------------------------------

export interface OllamaProviderConfig {
  /** Base URL of the tenant's Ollama server, e.g. "https://ollama.acme.com" */
  endpointUrl: string
  /** Ollama model name, e.g. "llama3.1:70b" */
  modelId: string
  /** Optional Bearer token for endpoints behind reverse proxies */
  bearerToken?: string
}

export class OllamaProvider implements AIProvider {
  readonly name = "ollama" as const
  readonly modelId: string
  private readonly sdkProvider: ReturnType<typeof createOpenAICompatible>

  constructor(config: OllamaProviderConfig) {
    this.modelId = config.modelId
    // Ollama exposes OpenAI-compatible endpoint at <baseURL>/v1.
    // Trailing slashes are normalized by the validator before storage,
    // but we defensively trim here too.
    const trimmed = config.endpointUrl.replace(/\/+$/, "")
    this.sdkProvider = createOpenAICompatible({
      name: "ollama",
      baseURL: `${trimmed}/v1`,
      apiKey: config.bearerToken,
    })
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

/**
 * Deprecated alias — kept for compatibility with the old placeholder
 * import. New code should use {@link OllamaProvider}.
 */
export const OllamaRiskProvider = OllamaProvider
