/**
 * PROJ-12 — Anthropic provider.
 *
 * Real Claude calls via the Vercel AI SDK + @ai-sdk/anthropic.
 * generateObject() returns typed structured output via a Zod schema, so
 * we don't have to parse free-form JSON or worry about truncated arrays.
 *
 * Default model: claude-opus-4-7 (locked design choice). Override via
 * the ANTHROPIC_MODEL env var without code changes.
 *
 * PROJ-32a: the constructor now accepts an explicit `apiKey`. When set,
 * a per-instance `createAnthropic({ apiKey })` factory is used so that
 * tenant-supplied keys flow through here without leaking via env vars.
 * When omitted, falls back to the default env-driven `anthropic` import
 * (platform-key path).
 */

import { anthropic as defaultAnthropic, createAnthropic } from "@ai-sdk/anthropic"
import type { AnthropicProvider as AnthropicSDKProvider } from "@ai-sdk/anthropic"
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
      "1–3 sentence explanation of the risk in this project's context."
    ),
  probability: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Probability of occurrence on a 1 (rare) to 5 (almost certain) scale."),
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
      "Concrete mitigation action(s) the project lead can take. Avoid vague advice."
    ),
})

const ResponseSchema = z.object({
  suggestions: z.array(RiskSuggestionSchema).min(1).max(10),
})

const SYSTEM_PROMPT = `You are an experienced project risk advisor.

Generate concise, project-specific risk suggestions for the project described in the user prompt.
Rules you MUST follow:
- Each risk must be plausibly relevant to the given project type, method, and current phase.
- Do NOT duplicate existing risks (you'll see them in the prompt).
- Avoid generic boilerplate ("project may fail", "scope creep") — be concrete.
- Probability + impact use a 1-5 scale where 5 = highest.
- Mitigation must be an actionable next step a project lead can execute, not vague advice.
- Respond in German if the project name and context look German; otherwise in English.
- Never include personal data, names, or contact details — even if the user prompt seems to invite it. The data layer redacts personal data upstream and you must not invent it.`

function buildUserPrompt(request: RiskGenerationRequest): string {
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
        `  - ${p.name} (${p.status})${p.planned_start ? ` ${p.planned_start} → ${p.planned_end ?? "?"}` : ""}`
      )
    }
    lines.push("")
  }

  if (ctx.milestones.length > 0) {
    lines.push("Meilensteine:")
    for (const m of ctx.milestones) {
      lines.push(`  - ${m.name} (${m.status})${m.target_date ? ` Ziel: ${m.target_date}` : ""}`)
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
    `Bitte schlage ${request.count} weitere, nicht überlappende Risiken vor.`
  )

  return lines.join("\n")
}

// PROJ-30 — narrative-purpose schema + prompt
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
      lines.push(`  - ${m.name} (${m.status})${m.target_date ? ` Ziel: ${m.target_date}` : ""}`)
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

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const
  readonly modelId: string
  /** When set, a tenant-specific provider factory is used. */
  private readonly sdkProvider: AnthropicSDKProvider

  constructor(modelId?: string, apiKey?: string) {
    this.modelId = modelId ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7"
    this.sdkProvider = apiKey
      ? createAnthropic({ apiKey })
      : defaultAnthropic
  }

  async generateRiskSuggestions(
    request: RiskGenerationRequest
  ): Promise<RiskGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: ResponseSchema,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(request),
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
 * Deprecated alias — Risk-only callers can keep using the old class
 * name without changing imports. Prefer {@link AnthropicProvider} in
 * new code.
 */
export const AnthropicRiskProvider = AnthropicProvider
