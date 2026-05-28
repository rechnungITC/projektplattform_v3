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
  TrajectorySequenceGenerationRequest,
} from "./types"
import type {
  NarrativeGenerationOutput,
  RiskGenerationOutput,
  TrajectorySequenceGenerationOutput,
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

// PROJ-65 ε.4.α — trajectory-sequence schema + prompt
const TrajectorySequenceSuggestionSchema = z.object({
  title: z
    .string()
    .min(8)
    .max(140)
    .describe(
      "Short German title for the suggestion — references at least one node by name.",
    ),
  rationale: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "1–3 sentence German rationale citing the node names and the date / dependency observation that motivates the suggestion.",
    ),
  kind: z.enum(["parallelize", "reorder", "serialize", "merge"]),
  affected_node_ids: z
    .array(z.string().regex(/^(phase|sprint):[0-9a-f-]{36}$/))
    .min(1)
    .max(8)
    .describe(
      "phase:<uuid> or sprint:<uuid> ids — must match ids that appear in the prompt context.",
    ),
  estimated_savings_days: z
    .number()
    .int()
    .min(0)
    .max(365)
    .nullable()
    .optional(),
  confidence: z.enum(["low", "medium", "high"]),
})

const TrajectorySequenceResponseSchema = z.object({
  suggestions: z.array(TrajectorySequenceSuggestionSchema).min(0).max(5),
})

const TRAJECTORY_SEQUENCE_SYSTEM_PROMPT = `Du bist ein erfahrener Projektplaner.

Aufgabe: Analysiere die Phasen-/Sprint-Struktur eines Projekts und schlage gezielt 0–5 Verbesserungen für die Reihenfolge bzw. Parallelisierung vor.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Jede Empfehlung muss konkret und nachprüfbar sein — sie nennt mindestens einen Knoten beim Namen und begründet die Beobachtung (Datums-Überlappung, fehlende Dependency, redundante Serialisierung).
- KEINE personenbezogenen Daten, KEINE Namen von Personen, KEINE Rolle/Verantwortlichen — der Kontext liefert sie bewusst nicht.
- Bewege dich strikt im Class-2-Universum: nur Phasen, Sprints, Milestones, Dependencies, Ziele.
- Die \`affected_node_ids\` MÜSSEN exakt den \`phase:<uuid>\`- bzw. \`sprint:<uuid>\`-IDs entsprechen, die im Kontext auftauchen. Erfinde keine IDs.
- \`kind\` wählst du sparsam: parallelize (Wege voneinander entkoppeln), reorder (Reihenfolge ändern), serialize (Parallelität auflösen), merge (Knoten zusammenführen).
- Lass das Array leer, wenn die Struktur bereits sauber ist — kein erzwungenes Padding.
- \`confidence\` reflektiert deine Sicherheit: high nur, wenn Datums- und Dependency-Evidenz die Empfehlung tragen.`

function buildTrajectorySequencePrompt(
  request: TrajectorySequenceGenerationRequest,
): string {
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
    lines.push("Phasen (id · name · status · von..bis · seq):")
    for (const p of ctx.phases) {
      lines.push(
        `  - phase:${p.id} · ${p.name} · ${p.status} · ${p.planned_start ?? "?"}…${p.planned_end ?? "?"} · seq=${p.sequence_number ?? "—"}`,
      )
    }
    lines.push("")
  }
  if (ctx.sprints.length > 0) {
    lines.push("Sprints (id · name · state · von..bis):")
    for (const s of ctx.sprints) {
      lines.push(
        `  - sprint:${s.id} · ${s.name} · ${s.state} · ${s.start_date ?? "?"}…${s.end_date ?? "?"}`,
      )
    }
    lines.push("")
  }
  if (ctx.milestones.length > 0) {
    lines.push("Milestones (id · name · status · target):")
    for (const m of ctx.milestones) {
      lines.push(
        `  - milestone:${m.id} · ${m.name} · ${m.status} · ${m.target_date ?? "?"}`,
      )
    }
    lines.push("")
  }
  if (ctx.dependencies.length > 0) {
    lines.push("Dependencies (from → to · constraint):")
    for (const d of ctx.dependencies) {
      lines.push(
        `  - ${d.from_type}:${d.from_id} → ${d.to_type}:${d.to_id} · ${d.constraint_type}`,
      )
    }
    lines.push("")
  }
  if (ctx.goals.length > 0) {
    lines.push("Ziele (id · titel · target · status):")
    for (const g of ctx.goals) {
      lines.push(
        `  - goal:${g.id} · ${g.title} · ${g.target_date ?? "?"} · ${g.status ?? "?"}`,
      )
    }
    lines.push("")
  }

  lines.push(
    `Liefere bis zu ${request.count} prägnante Vorschläge. Wenn nichts auffällt, liefere eine leere Liste.`,
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

  async generateTrajectorySequence(
    request: TrajectorySequenceGenerationRequest,
  ): Promise<TrajectorySequenceGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: TrajectorySequenceResponseSchema,
      system: TRAJECTORY_SEQUENCE_SYSTEM_PROMPT,
      prompt: buildTrajectorySequencePrompt(request),
      temperature: 0.2,
    })

    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined

    return {
      suggestions: result.object.suggestions.map((s) => ({
        title: s.title,
        rationale: s.rationale,
        kind: s.kind,
        affected_node_ids: s.affected_node_ids,
        estimated_savings_days: s.estimated_savings_days ?? null,
        confidence: s.confidence,
      })),
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
