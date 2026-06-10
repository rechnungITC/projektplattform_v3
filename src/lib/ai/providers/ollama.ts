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
  CoachingGenerationRequest,
  CrossProjectLinksGenerationRequest,
  NarrativeGenerationRequest,
  ProposalFromContextGenerationRequest,
  ResourceSwapGenerationRequest,
  RiskGenerationRequest,
  SentimentGenerationRequest,
  StakeholderProposalsGenerationRequest,
  TrajectorySequenceGenerationRequest,
} from "./types"
import type {
  CoachingGenerationOutput,
  CoachingKind,
  CrossProjectLinksGenerationOutput,
  NarrativeGenerationOutput,
  ProposalFromContextGenerationOutput,
  ResourceSwapGenerationOutput,
  RiskGenerationOutput,
  SentimentGenerationOutput,
  StakeholderProposalsGenerationOutput,
  TrajectorySequenceGenerationOutput,
} from "../types"
// PROJ-85 — Class-2 advisory graph purposes for tenant-local Ollama. We
// reuse the SHARED schemas/prompts/mappers (battle-tested by the
// AnthropicProvider) rather than Ollama-local variants: trajectory +
// cross-links are structured-reasoning purposes where the shared prompt
// already produces compatible output, and reusing it keeps the matrix
// honest (no drift between cloud + local output shapes).
import {
  buildCrossProjectLinksPrompt,
  buildTrajectorySequencePrompt,
  CROSS_PROJECT_LINKS_SYSTEM_PROMPT,
  CrossProjectLinksResponseSchema,
  mapCrossProjectLinksSuggestions,
  mapTrajectorySequenceSuggestions,
  TRAJECTORY_SEQUENCE_SYSTEM_PROMPT,
  TrajectorySequenceResponseSchema,
} from "./graph-purpose-prompts"

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
// PROJ-34-γ.1 — Sentiment schema + prompt
//
// Class-3 implication: this prompt DOES carry personenbezogene Daten
// (Stakeholder-Namen + Verhaltensbewertung). It is sent only to a
// tenant-supplied Ollama endpoint — the data stays in the tenant's
// control domain by definition (CIA-L1). No "redact names" disclaimer
// is added here, because the model needs the labels to attribute its
// per-participant output.
// ---------------------------------------------------------------------------

const SentimentSignalSchema = z.object({
  stakeholder_id: z
    .string()
    .uuid()
    .describe("UUID des Teilnehmers (aus dem Prompt unverändert übernehmen)"),
  sentiment: z
    .number()
    .int()
    .min(-2)
    .max(2)
    .describe(
      "Stimmungs-Wert auf -2..+2 Skala (−2 stark negativ, 0 neutral, +2 stark positiv).",
    ),
  cooperation_signal: z
    .number()
    .int()
    .min(-2)
    .max(2)
    .describe(
      "Kooperations-Wert auf -2..+2 Skala (−2 obstruktiv, 0 neutral, +2 sehr kooperativ).",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Konfidenz 0..1; niedrige Werte bei Unsicherheit oder dünner Datenbasis.",
    ),
})

const SentimentResponseSchema = z.object({
  signals: z.array(SentimentSignalSchema).min(1),
})

const SENTIMENT_SYSTEM_PROMPT = `Du bist ein erfahrener Projektmanagement-Berater und beurteilst Stakeholder-Interaktionen.

Du bekommst eine **Summary** einer Interaktion (vom Projektleiter redigiert, keine Roh-E-Mails) und eine Liste der Teilnehmer. Aufgabe: für **jeden** Teilnehmer einen eigenen Stimmungs- + Kooperations-Wert auf der −2..+2 Skala vergeben.

Pflichtregeln:
- Pro Teilnehmer **genau eine** Signal-Zeile mit der **unveränderten Stakeholder-UUID** aus dem Prompt.
- Werte sind ganzzahlig in {-2, -1, 0, +1, +2}. Skala:
  - sentiment: −2 stark negativ, −1 negativ, 0 neutral, +1 positiv, +2 stark positiv
  - cooperation_signal: −2 obstruktiv (blockt aktiv), −1 skeptisch (zögert), 0 neutral, +1 kooperativ, +2 sehr kooperativ (treibt voran)
- Konfidenz spiegelt deine Sicherheit wider: 0.3 bei dünner/uneindeutiger Summary; 0.7–0.9 bei klaren Hinweisen.
- KEINE Spekulation außerhalb der Summary. Wenn ein Teilnehmer in der Summary nicht explizit auftaucht → konservativ 0/0 mit niedriger Konfidenz.
- Sprache des Outputs ist nicht relevant — du gibst nur Zahlen + UUIDs zurück.`

function buildSentimentPrompt(request: SentimentGenerationRequest): string {
  const ctx = request.context
  const lines: string[] = [
    "Summary der Interaktion:",
    ctx.summary,
    "",
    "Teilnehmer (UUID → Label):",
  ]
  for (const p of ctx.participants) {
    lines.push(`  - ${p.stakeholder_id} → ${p.label}`)
  }
  lines.push(
    "",
    `Bitte gib für jeden der ${ctx.participants.length} Teilnehmer eine eigene Signal-Zeile zurück. UUIDs unverändert übernehmen.`,
  )
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// PROJ-34-ε — Coaching schema + prompt
//
// Class-3 like sentiment: prompt aggregates qualitative profile fields
// (Big5, skills, interaction history) plus risk-score + tonality hint.
// All sent to tenant-supplied Ollama only.
// ---------------------------------------------------------------------------

const CoachingKindEnum = z.enum([
  "outreach",
  "tonality",
  "escalation",
  "celebration",
])

const CoachingRecommendationSchema = z.object({
  kind: CoachingKindEnum.describe(
    "outreach = aktive Kontaktaufnahme empfehlen; tonality = Tonalitäts-Adjustment; escalation = Eskalations-/Steering-Hinweis; celebration = positive Anerkennung.",
  ),
  text: z
    .string()
    .min(20)
    .max(1000)
    .describe(
      "Empfehlungs-Text (deutsch), 2–4 Sätze, konkrete Handlungsanleitung für den Projektleiter.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Konfidenz 0..1; niedrige Werte bei dünner Datenbasis."),
  cited_interaction_ids: z
    .array(z.string().uuid())
    .max(10)
    .describe(
      "UUIDs der zitierten Interaktionen aus dem Prompt. Nur tatsächlich referenzierte.",
    ),
  cited_profile_fields: z
    .array(z.string())
    .max(20)
    .describe(
      "Schlüssel der zitierten Profile-Felder, z.B. 'big5_neuroticism', 'skill_negotiation_skill', 'attitude'. Nur tatsächlich referenzierte.",
    ),
})

const CoachingResponseSchema = z.object({
  recommendations: z.array(CoachingRecommendationSchema).max(4),
})

const COACHING_SYSTEM_PROMPT = `Du bist ein erfahrener Stakeholder-Coach und berätst Projektleiter zur Kommunikation mit einem konkreten Stakeholder.

Du bekommst:
1. Stakeholder-Profil (Big5, Skills, qualitative Felder wie Haltung, Kommunikationsbedarf, bevorzugter Kanal)
2. Die letzten Interaktionen mit Summary + Sentiment + Kooperations-Signalen
3. Optionalen PROJ-35 Risiko-Score + Eskalations-Pattern + Tonalitäts-Hint
4. Antwortverhaltens-Statistik (offene Antworten, durchschnittliche Latenz, Overdue-Flag)

Aufgabe: gib **0 bis 4** Coaching-Empfehlungen aus, **maximal eine pro kind**.

Pflichtregeln:
- Empfehlung muss aus den Daten ableitbar sein. Wenn nichts vorliegt, was eine Empfehlung trägt → leeres Array.
- "outreach" nur bei klarem Trigger (überfällige Antwort, lange Stille, Risiko-Eskalation).
- "tonality" nur wenn Big5 / Tonalitäts-Hint einen konkreten Hinweis trägt.
- "escalation" nur bei Risiko-Score-Threshold oder klar negativer Sentiment-Historie.
- "celebration" nur bei dokumentiert positiver Kooperation in jüngsten Interaktionen.
- Cited-Felder müssen **exakt** Schlüssel aus dem Prompt enthalten — keine erfundenen Keys.
- Sprache: Deutsch, sachlich-professionell, du-Form für den Projektleiter.
- KEINE Spekulation über Stakeholder-Gedanken/Motive; nur Verhaltens-basierte Hinweise.`

function buildCoachingPrompt(request: CoachingGenerationRequest): string {
  const ctx = request.context
  const lines: string[] = [
    `Stakeholder: ${ctx.stakeholder_name} (UUID: ${ctx.stakeholder_id})`,
    "",
    "Profil:",
  ]
  if (ctx.profile.big5) {
    for (const [dim, val] of Object.entries(ctx.profile.big5)) {
      lines.push(`  - big5_${dim}: ${val}`)
    }
  }
  if (ctx.profile.skills) {
    for (const [skill, val] of Object.entries(ctx.profile.skills)) {
      lines.push(`  - skill_${skill}: ${val}`)
    }
  }
  for (const k of [
    "reasoning",
    "attitude",
    "management_level",
    "decision_authority",
    "communication_need",
    "preferred_channel",
  ] as const) {
    const v = ctx.profile[k]
    if (v) lines.push(`  - ${k}: ${v}`)
  }
  lines.push("")

  lines.push(
    `PROJ-35 Risk-Score: ${ctx.risk.score ?? "—"}; Eskalations-Pattern: ${ctx.risk.escalation_pattern ?? "—"}; Critical-Path: ${ctx.risk.critical_path ?? "—"}`,
  )
  if (ctx.tonality_hint) {
    lines.push(`PROJ-35 Tonalitäts-Hint: "${ctx.tonality_hint}"`)
  }
  lines.push(
    `Antwortverhalten: ${ctx.response_stats.awaiting_count} offene Antworten, Ø Latenz ${
      ctx.response_stats.avg_response_latency_hours == null
        ? "—"
        : `${ctx.response_stats.avg_response_latency_hours.toFixed(1)} h`
    }, Overdue=${ctx.response_stats.has_overdue}`,
  )
  lines.push("")

  if (ctx.recent_interactions.length > 0) {
    lines.push("Letzte Interaktionen (UUID, Datum, Channel, Sentiment/Coop, Summary):")
    for (const i of ctx.recent_interactions) {
      lines.push(
        `  - ${i.interaction_id} | ${i.interaction_date} | ${i.channel}/${i.direction} | s=${i.participant_sentiment ?? "—"}, c=${i.participant_cooperation_signal ?? "—"} | ${i.summary.slice(0, 200)}`,
      )
    }
  } else {
    lines.push("Letzte Interaktionen: keine im 30-Tage-Fenster.")
  }
  lines.push(
    "",
    "Bitte 0..4 Empfehlungen ausgeben. Maximal eine pro kind. Cited-Felder müssen exakt aus dem Prompt stammen.",
  )
  return lines.join("\n")
}

// Helper used by both new methods — keeps the kind cardinality contract
// enforced server-side even if the model emits duplicates.
function dedupRecommendationsByKind(
  recs: Array<{ kind: CoachingKind } & Record<string, unknown>>,
): typeof recs {
  const seen = new Set<string>()
  const out: typeof recs = []
  for (const r of recs) {
    if (seen.has(r.kind)) continue
    seen.add(r.kind)
    out.push(r)
  }
  return out
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

// ---------------------------------------------------------------------------
// PROJ-65 ε.4.β — resource-swap schema + prompt (Class-3, Ollama-only)
// ---------------------------------------------------------------------------

const ResourceSwapSuggestionSchema = z.object({
  title: z.string().min(8).max(160).describe("Kurzer deutscher Titel."),
  rationale: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "1–3 Sätze (Deutsch). Zitiert Skills + Auslastung; KEINE €-Zahlen wenn Buckets vorliegen.",
    ),
  kind: z.enum([
    "skill_mismatch",
    "overallocation",
    "cost_optimization",
    "availability",
  ]),
  work_item_id: z.string().uuid(),
  from_resource_id: z.string().uuid(),
  to_resource_id: z.string().uuid(),
  fit_score: z.number().int().min(0).max(100),
  confidence: z.enum(["low", "medium", "high"]),
})

const ResourceSwapResponseSchema = z.object({
  suggestions: z.array(ResourceSwapSuggestionSchema).min(0).max(5),
})

const RESOURCE_SWAP_SYSTEM_PROMPT = `Du bist ein erfahrener Ressourcen-Planer und schlägst gezielte Stakeholder-/Ressourcen-Wechsel vor.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Jede Empfehlung muss EINE konkrete from→to-Ersetzung sein. Wähle from_resource_id aus den current_assignees des Work-Items; wähle to_resource_id aus den candidate_resources oder aus current_assignees anderer Work-Items.
- Die IDs (work_item_id, from_resource_id, to_resource_id) MÜSSEN exakt UUIDs aus dem Kontext sein. Erfinde nichts.
- Schreibe NIE einen Tagessatz in €. Wenn der Kontext Rate-Buckets (low/mid/high) enthält, verwende NUR diese Bucket-Begriffe in der Begründung — nie €-Zahlen, auch nicht geschätzte.
- Wenn der Kontext echte €-Werte enthält (cost_clear_view=true), darfst du diese referenzieren ("≈ 100€ günstiger") — bleib aber qualitativ; keine Hochrechnungen.
- 0 Empfehlungen sind ein gültiges Ergebnis, wenn die aktuelle Zuordnung passt. Kein erzwungenes Padding.
- \`kind\` wählst du gezielt: skill_mismatch (Skill-Profil passt nicht), overallocation (Person ist überlastet), cost_optimization (günstigere Person mit vergleichbarem Profil), availability (Verfügbarkeit besser).
- \`confidence=high\` nur, wenn Skill- UND Auslastungs-Evidenz die Empfehlung tragen.
- Schlage nicht denselben from→to-Swap mehrfach vor.
- Schlage nicht eine Resource zum Tausch mit sich selbst vor.`

function buildResourceSwapPrompt(
  request: ResourceSwapGenerationRequest,
): string {
  const ctx = request.context
  const lines: string[] = []
  lines.push(
    ctx.cost_clear_view
      ? "Rate-Sichtbarkeit: KLARTEXT (€/Tag). Du darfst Werte qualitativ vergleichen, aber bleib zurückhaltend."
      : "Rate-Sichtbarkeit: GEBUCKETED. Verwende NUR low/mid/high, NIE €-Zahlen.",
  )
  lines.push(`Kandidaten-Pool: top-${ctx.candidate_resources.length} von ${ctx.candidate_resources.length + ctx.candidate_pool_truncated_by} aktiven Ressourcen.`)
  lines.push("")

  if (ctx.work_items.length === 0) {
    lines.push("Keine aktiven Work-Items mit Zuordnung — keine Empfehlung erforderlich.")
  } else {
    lines.push("Work-Items mit aktuellen Zuordnungen:")
    for (const w of ctx.work_items) {
      lines.push(
        `  - work_item:${w.work_item_id} · "${w.title}" (${w.kind}, ${w.status})`,
      )
      for (const a of w.current_assignees) {
        lines.push(
          `      ↳ resource:${a.resource_id} ${formatResourceRef(a)}`,
        )
      }
    }
    lines.push("")
  }

  if (ctx.candidate_resources.length > 0) {
    lines.push("Kandidaten (Swap-Ziele):")
    for (const c of ctx.candidate_resources) {
      lines.push(`  - resource:${c.resource_id} ${formatResourceRef(c)}`)
    }
    lines.push("")
  }

  lines.push(
    `Liefere bis zu ${request.count} gezielte Wechsel-Empfehlungen. Wenn keine Empfehlung gerechtfertigt ist, liefere eine leere Liste.`,
  )

  return lines.join("\n")
}

function formatResourceRef(
  r: import("../types").ResourceSwapResourceRef,
): string {
  const parts: string[] = []
  parts.push(`"${r.stakeholder_name ?? r.display_name}"`)
  if (r.role_key) parts.push(`Rolle=${r.role_key}`)
  if (r.skills.length > 0) parts.push(`Skills=[${r.skills.join(", ")}]`)
  if (r.rate_eur !== null) parts.push(`Rate=${r.rate_eur}€/Tag`)
  else if (r.rate_bucket !== null) parts.push(`Rate-Bucket=${r.rate_bucket}`)
  return parts.join(" · ")
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

  async generateSentiment(
    request: SentimentGenerationRequest,
  ): Promise<SentimentGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: SentimentResponseSchema,
      system: SENTIMENT_SYSTEM_PROMPT,
      prompt: buildSentimentPrompt(request),
      temperature: 0.2,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined

    // Ensure exactly one signal per requested participant — silently
    // synthesize a neutral 0/0/0.3 row if the model misses one.
    const byId = new Map(
      result.object.signals.map((s) => [s.stakeholder_id, s]),
    )
    const signals = request.context.participants.map((p) => {
      const found = byId.get(p.stakeholder_id)
      if (found) {
        return {
          stakeholder_id: found.stakeholder_id,
          sentiment: found.sentiment,
          cooperation_signal: found.cooperation_signal,
          confidence: found.confidence,
        }
      }
      return {
        stakeholder_id: p.stakeholder_id,
        sentiment: 0,
        cooperation_signal: 0,
        confidence: 0.3,
      }
    })

    return {
      signals,
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  async generateResourceSwap(
    request: ResourceSwapGenerationRequest,
  ): Promise<ResourceSwapGenerationOutput> {
    const start = Date.now()

    // Build the id-validation sets so we can reject any work_item /
    // from_resource / to_resource the model hallucinates outside the
    // context. CIA-L1 defense-in-depth.
    const validWorkItemIds = new Set(
      request.context.work_items.map((w) => w.work_item_id),
    )
    const validResourceIds = new Set<string>([
      ...request.context.candidate_resources.map((r) => r.resource_id),
      ...request.context.work_items.flatMap((w) =>
        w.current_assignees.map((a) => a.resource_id),
      ),
    ])

    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: ResourceSwapResponseSchema,
      system: RESOURCE_SWAP_SYSTEM_PROMPT,
      prompt: buildResourceSwapPrompt(request),
      temperature: 0.3,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined

    const suggestions = result.object.suggestions
      .filter(
        (s) =>
          validWorkItemIds.has(s.work_item_id) &&
          validResourceIds.has(s.from_resource_id) &&
          validResourceIds.has(s.to_resource_id) &&
          s.from_resource_id !== s.to_resource_id,
      )
      .map((s) => ({
        title: s.title,
        rationale: s.rationale,
        kind: s.kind,
        work_item_id: s.work_item_id,
        from_resource_id: s.from_resource_id,
        to_resource_id: s.to_resource_id,
        fit_score: Math.max(0, Math.min(100, s.fit_score)),
        confidence: s.confidence,
      }))

    return {
      suggestions,
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  async generateCoaching(
    request: CoachingGenerationRequest,
  ): Promise<CoachingGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: CoachingResponseSchema,
      system: COACHING_SYSTEM_PROMPT,
      prompt: buildCoachingPrompt(request),
      temperature: 0.4,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined

    // Filter cited fields against what was actually supplied to the
    // prompt — model occasionally invents keys; the router also enforces
    // ≤ 1 per kind but we dedup here too as defense-in-depth.
    const validInteractionIds = new Set(
      request.context.recent_interactions.map((i) => i.interaction_id),
    )
    const recommendations = dedupRecommendationsByKind(
      result.object.recommendations,
    ).map((r) => ({
      kind: r.kind as CoachingKind,
      text: r.text as string,
      confidence: r.confidence as number,
      cited_interaction_ids: ((r.cited_interaction_ids as string[]) ?? []).filter(
        (id) => validInteractionIds.has(id),
      ),
      cited_profile_fields: ((r.cited_profile_fields as string[]) ?? []).slice(
        0,
        20,
      ),
    }))

    return {
      recommendations,
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-70-α — proposal-from-context generation via local Ollama.
   *
   * Mirrors the Anthropic implementation: same Zod-schema, same prompt,
   * same hierarchical output. The only difference is the underlying SDK
   * client (createOpenAICompatible → Ollama's OpenAI-compatible endpoint).
   *
   * Defense-in-depth: after the model returns, walk every suggestion's
   * `parent_temp_id` and verify it resolves to a sibling temp_id. If a
   * hallucinated ref slipped past Zod (shouldn't happen, but trust nothing),
   * we drop the offending item rather than persist a dangling chain.
   */
  async generateProposalFromContext(
    request: ProposalFromContextGenerationRequest,
  ): Promise<ProposalFromContextGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: ProposalFromContextResponseSchemaOllama,
      system: PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT_OLLAMA,
      prompt: buildProposalFromContextPromptOllama(request),
      temperature: 0.3,
    })

    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined

    // Trust-but-verify: filter hallucinated parent refs (Zod superRefine
    // already runs, this is defense-in-depth).
    const tempIds = new Set(result.object.suggestions.map((s) => s.temp_id))
    const validSuggestions = result.object.suggestions.filter(
      (s) => s.parent_temp_id == null || tempIds.has(s.parent_temp_id),
    )

    return {
      suggestions: validSuggestions.map((s) => ({
        temp_id: s.temp_id,
        parent_temp_id: s.parent_temp_id,
        kind: s.kind,
        title: s.title,
        description: s.description ?? null,
        confidence: s.confidence,
        relevance: s.relevance,
      })),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-85 — trajectory-sequence generation via tenant-local Ollama.
   *
   * Closes the capability gap where a tenant using Ollama for Class-1/2
   * data requested trajectory suggestions and the router silently fell
   * back to the StubProvider. Reuses the shared schema/prompt/mapper so
   * the local output shape matches the cloud providers'.
   */
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
      suggestions: mapTrajectorySequenceSuggestions(result.object.suggestions),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-85 — cross-project-links generation via tenant-local Ollama.
   * Same gap-close + shared-schema rationale as
   * `generateTrajectorySequence`. The mapper filters hallucinated work-item
   * ids against the request's known ids (defense-in-depth).
   */
  async generateCrossProjectLinks(
    request: CrossProjectLinksGenerationRequest,
  ): Promise<CrossProjectLinksGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: CrossProjectLinksResponseSchema,
      system: CROSS_PROJECT_LINKS_SYSTEM_PROMPT,
      prompt: buildCrossProjectLinksPrompt(request),
      temperature: 0.2,
    })

    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined

    return {
      suggestions: mapCrossProjectLinksSuggestions(
        result.object.suggestions,
        request,
      ),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-88 — stakeholder extraction from a kickoff via local Ollama.
   *
   * Class-3-pinned purpose: this method only ever runs on the tenant-local
   * endpoint, so personal names in the excerpt/output never leave the
   * tenant boundary. Defense-in-depth after the model returns:
   *   - `duplicate_of_stakeholder_id` must reference an id that was in the
   *     supplied `existing_stakeholders` list (hallucinated ids → null).
   *   - empty-string contacts normalise to null.
   */
  async generateStakeholderProposals(
    request: StakeholderProposalsGenerationRequest,
  ): Promise<StakeholderProposalsGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: StakeholderProposalsResponseSchemaOllama,
      system: STAKEHOLDER_PROPOSALS_SYSTEM_PROMPT_OLLAMA,
      prompt: buildStakeholderProposalsPromptOllama(request),
      temperature: 0.2,
    })

    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined

    const validStakeholderIds = new Set(
      request.context.existing_stakeholders.map((s) => s.stakeholder_id),
    )

    return {
      suggestions: result.object.suggestions.map((s) => ({
        name: s.name,
        kind: s.kind,
        origin: s.origin,
        role_key: emptyToNull(s.role_key),
        org_unit: emptyToNull(s.org_unit),
        contact_email: emptyToNull(s.contact_email),
        contact_phone: emptyToNull(s.contact_phone),
        duplicate_of_stakeholder_id:
          s.duplicate_of_stakeholder_id != null &&
          validStakeholderIds.has(s.duplicate_of_stakeholder_id)
            ? s.duplicate_of_stakeholder_id
            : null,
        source_quote: emptyToNull(s.source_quote),
        confidence: s.confidence,
        relevance: s.relevance,
      })),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// PROJ-70-α — local schema + prompt for Ollama
// ---------------------------------------------------------------------------
// Defined OUTSIDE the class so they're not re-allocated per instance. The
// prompt is identical to the Anthropic one; we keep a copy here rather
// than reach across providers, mirroring the pattern from ε.4.β resource_swap.

const ProposalFromContextSuggestionSchemaOllama = z.object({
  temp_id: z.string().min(1).max(64),
  parent_temp_id: z.string().min(1).max(64).nullable(),
  kind: z.enum([
    "phase",
    "work_package",
    "todo",
    "epic",
    "story",
    "task",
    "subtask",
    "bug",
  ]),
  title: z.string().min(3).max(200),
  description: z.string().max(500).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  // PROJ-91 — relevance to the project goal (Vorhaben); see shared schema.
  relevance: z.enum(["on_goal", "off_goal"]),
})

const ProposalFromContextResponseSchemaOllama = z.object({
  suggestions: z.array(ProposalFromContextSuggestionSchemaOllama).min(0).max(50),
})

// Exported for the PROJ-91 grounding contract test (mirror of the shared prompt).
export const PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT_OLLAMA = `Du bist ein erfahrener Programm-/Projektleiter und schlägst aus einem Kickoff-Artefakt eine konkrete Anfangs-Backlog-Struktur vor.

Aufgabe: Analysiere den Inhalt eines Kickoff-Dokuments und schlage 0–50 hierarchische Backlog-Items vor.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Jedes Item bekommt eine eindeutige \`temp_id\` (z.B. "t_1", "t_2", …). Über \`parent_temp_id\` zeigst du auf das übergeordnete Item desselben Runs (null bei Top-Level-Items).
- Wähle \`kind\` passend zur Projektmethode (Wasserfall: phase/work_package/todo; Scrum: epic/story/task; Hybrid: mische methodensauber).
- Titel ist konkret und actionable, keine Boilerplate.
- \`description\` ist optional, max 500 Zeichen.
- KEINE Class-3-Daten in den Outputs: keine konkreten Personennamen, E-Mails, Telefonnummern. Generalisiere zu Rollen.
- Hierarchie maximal 3 Ebenen tief.
- Bei dünnem Kickoff: lieber leere Liste statt erzwungenes Padding.
- \`relevance\` bewertet den Bezug zum Vorhaben/Projektziel (separate Achse zur \`confidence\`): \`on_goal\`, wenn das Item dem Vorhaben dient; \`off_goal\`, wenn es aus dem Kickoff stammt, aber nicht zum Vorhaben passt. Unterdrücke \`off_goal\`-Items NICHT.
- Grounding-Regel: Extrahiere Items AUSSCHLIESSLICH aus dem Kickoff-Dokument. Erfinde KEINE Items aus dem Vorhaben — das Vorhaben ist NUR der Bewertungsmaßstab für \`relevance\`, NIE eine Quelle für Items. Ohne angegebenes Vorhaben: \`on_goal\`.`

// Exported for the PROJ-91 grounding contract test (mirror of the shared builder).
export function buildProposalFromContextPromptOllama(
  request: ProposalFromContextGenerationRequest,
): string {
  const ctx = request.context
  const vorhaben = ctx.source_project.description?.trim()
  const lines: string[] = [
    `Projekt: ${ctx.source_project.name}`,
    `Methode: ${ctx.source_project.project_method ?? "—"} (normalised: ${ctx.method_hint})`,
    // PROJ-91 — Vorhaben is ONLY the relevance yardstick, never an item source.
    vorhaben
      ? `\nVorhaben (Projektziel — NUR Bewertungsmaßstab für relevance, KEINE Quelle für Items):\n${vorhaben}`
      : `\n(Kein Vorhaben hinterlegt — relevance=on_goal.)`,
    "",
    `Kickoff-Artefakt (${ctx.context_source.kind}): ${ctx.context_source.title}`,
    `Privacy-Klasse: ${ctx.context_source.privacy_class}`,
    "",
    `Inhalt:`,
    ctx.context_source.content_excerpt || "(leer)",
    "",
    `Liefere bis zu ${Math.min(request.count, 50)} hierarchisch verknüpfte Vorschläge.`,
  ]
  return lines.join("\n")
}


// ---------------------------------------------------------------------------
// PROJ-88 — local schema + prompt for stakeholder proposals (Ollama-only)
// ---------------------------------------------------------------------------

function emptyToNull(v: string | null | undefined): string | null {
  const trimmed = v?.trim()
  return trimmed ? trimmed : null
}

const StakeholderProposalSuggestionSchemaOllama = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(["person", "organization"]),
  origin: z.enum(["internal", "external"]),
  role_key: z.string().max(100).nullable(),
  org_unit: z.string().max(200).nullable(),
  contact_email: z.string().max(320).nullable(),
  contact_phone: z.string().max(50).nullable(),
  // Validated post-hoc against the supplied existing_stakeholders list.
  duplicate_of_stakeholder_id: z.string().nullable(),
  source_quote: z.string().max(300).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  // PROJ-91 track invariant (AC-88.9) — relevance to the Vorhaben.
  relevance: z.enum(["on_goal", "off_goal"]),
})

const StakeholderProposalsResponseSchemaOllama = z.object({
  suggestions: z.array(StakeholderProposalSuggestionSchemaOllama).min(0).max(30),
})

// Exported for the PROJ-88 grounding contract test (AC-88.9).
export const STAKEHOLDER_PROPOSALS_SYSTEM_PROMPT_OLLAMA = `Du bist ein erfahrener Programm-/Projektleiter und extrahierst die im Kickoff-Dokument GENANNTEN Stakeholder als strukturierte Vorschläge.

Aufgabe: Analysiere den Inhalt eines Kickoff-Dokuments und schlage 0-30 Stakeholder vor (Personen oder Organisationen), die der Projektleiter anschließend reviewt und gezielt akzeptiert.

Pflichtregeln:
- Antworte ausschließlich auf Deutsch.
- Extrahiere Stakeholder AUSSCHLIESSLICH aus dem Kickoff-Dokument. ERFINDE NIEMALS Namen. Erfinde KEINE Stakeholder aus dem Vorhaben — das Vorhaben ist NUR der Bewertungsmaßstab für \`relevance\`, NIE eine Quelle für Vorschläge.
- \`kind\`: \`person\` für natürliche Personen, \`organization\` für Firmen/Abteilungen/Gremien.
- \`origin\`: \`internal\`, wenn die Person/Organisation erkennbar zur eigenen Organisation gehört, sonst \`external\`.
- \`role_key\`: die im Dokument genannte Projektrolle (z.B. "Projektleiter Fachbereich"), max. 100 Zeichen. Wenn eine Rolle ohne klaren Namen genannt wird, KEINEN Namen erfinden — lasse die Erwähnung weg.
- \`contact_email\` / \`contact_phone\`: NUR übernehmen, wenn sie wörtlich im Dokument stehen. Niemals ableiten oder erraten.
- Dedup: Wenn eine Erwähnung einer der unter "Vorhandene Stakeholder" gelisteten Einträge ist (gleiche Person/Organisation), setze \`duplicate_of_stakeholder_id\` auf dessen ID statt einen neuen Vorschlag zu formulieren. Bei Unsicherheit: null lassen und \`confidence\` senken.
- \`source_quote\`: kurzes wörtliches Zitat (max. 300 Zeichen), das die Erwähnung im Dokument belegt — Pflicht für Nachvollziehbarkeit, wenn irgend möglich.
- \`confidence\`: \`low\`, wenn der Name mehrdeutig ist (könnte ein Produkt/System sein, z.B. "Microsoft Dynamics" ist KEIN Stakeholder); \`high\` nur bei eindeutiger Personen-/Organisationsnennung.
- \`relevance\` bewertet den Bezug zum Vorhaben/Projektziel: \`on_goal\`, wenn der Stakeholder für das beschriebene Vorhaben relevant ist; \`off_goal\`, wenn er aus dem Kickoff stammt, aber nicht zum Vorhaben passt. Unterdrücke \`off_goal\`-Einträge NICHT. Ohne angegebenes Vorhaben: \`on_goal\`.
- Produkte, Systeme, Tools und Methoden sind KEINE Stakeholder.
- KEIN erzwungenes Padding: lieber wenige belegte Vorschläge als viele vage.`

// Exported for the PROJ-88 grounding contract test (AC-88.9).
export function buildStakeholderProposalsPromptOllama(
  request: StakeholderProposalsGenerationRequest,
): string {
  const ctx = request.context
  const vorhaben = ctx.source_project.description?.trim()
  const existing =
    ctx.existing_stakeholders.length > 0
      ? ctx.existing_stakeholders
          .map(
            (s) =>
              `  - id=${s.stakeholder_id} | ${s.name} (${s.kind}${s.role_key ? `, ${s.role_key}` : ""})`,
          )
          .join("\n")
      : "  (keine)"

  const lines: string[] = [
    `Projekt: ${ctx.source_project.name}`,
    `Typ: ${ctx.source_project.project_type ?? "—"}`,
    `Methode: ${ctx.source_project.project_method ?? "—"}`,
    // PROJ-91 track invariant (AC-88.9): yardstick only, never a source.
    vorhaben
      ? `\nVorhaben (Projektziel — NUR Bewertungsmaßstab für relevance, KEINE Quelle für Vorschläge):\n${vorhaben}`
      : `\n(Kein Vorhaben hinterlegt — relevance=on_goal.)`,
    "",
    `Vorhandene Stakeholder (für Dedup via duplicate_of_stakeholder_id):`,
    existing,
    "",
    `Kickoff-Artefakt (${ctx.context_source.kind}): ${ctx.context_source.title}`,
    `Privacy-Klasse: ${ctx.context_source.privacy_class}`,
    "",
    `Inhalt:`,
    ctx.context_source.content_excerpt || "(leer)",
    "",
    `Liefere bis zu ${Math.min(request.count, 30)} Stakeholder-Vorschläge. Wenn das Dokument keine Stakeholder nennt, liefere eine leere Liste.`,
  ]
  return lines.join("\n")
}

/**
 * Deprecated alias — kept for compatibility with the old placeholder
 * import. New code should use {@link OllamaProvider}.
 */
export const OllamaRiskProvider = OllamaProvider
