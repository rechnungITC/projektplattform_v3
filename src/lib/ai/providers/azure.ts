/**
 * PROJ-92 — Azure OpenAI provider (Class-1/2 only).
 *
 * Fifth provider type in the PROJ-32 multi-provider architecture. Azure OpenAI
 * speaks the OpenAI wire protocol, so — like the Ollama provider — this uses
 * the Vercel first-party `@ai-sdk/openai-compatible` factory (NO new dep,
 * CIA-locked) pointed at the tenant's own Azure deployment:
 *
 *   baseURL     = {endpoint}/openai/deployments/{deployment}
 *   auth        = `api-key` header (Azure convention, not Bearer)
 *   api-version = required query param on every request
 *
 * Structurally identical to the OpenAIProvider otherwise: it implements the
 * cloud purposes by reusing the SHARED graph-purpose prompts/schemas so its
 * output shape never drifts from the other cloud providers (PROJ-85 lesson).
 *
 * Class-3 implications: Azure is cloud-resident. It is NOT in the local-only
 * set, so the resolver clamp + the DB class3_local_only CHECK keep it
 * structurally unselectable for Class-3 data (Invariant #3). The attested-EU
 * Class-3 path is PROJ-93, deliberately out of scope here.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"

import {
  CLOUD_PROVIDER_TIMEOUT_MS,
  createTimeoutFetch,
} from "../provider-timeout"
import { generateObject } from "ai"
import { z } from "zod"

import type {
  ProjectChatGenerationRequest,
  AIProvider,
  ClarifyingQuestionsGenerationRequest,
  DocumentSummaryGenerationRequest,
  CrossProjectLinksGenerationRequest,
  NarrativeGenerationRequest,
  ProposalFromContextGenerationRequest,
  RiskGenerationRequest,
  RiskProposalsGenerationRequest,
  TrajectorySequenceGenerationRequest,
} from "./types"
import type { ProjectChatGenerationOutput } from "../types"
import { runProjectChat } from "./project-chat-runner"
import type {
  ClarifyingQuestionsGenerationOutput,
  DocumentSummaryGenerationOutput,
  CrossProjectLinksGenerationOutput,
  NarrativeGenerationOutput,
  ProposalFromContextGenerationOutput,
  RiskGenerationOutput,
  RiskProposalsGenerationOutput,
  TrajectorySequenceGenerationOutput,
} from "../types"
import {
  buildClarifyingQuestionsPrompt,
  buildCrossProjectLinksPrompt,
  buildProposalFromContextPrompt,
  buildRiskProposalsPrompt,
  buildTrajectorySequencePrompt,
  CLARIFYING_QUESTIONS_SYSTEM_PROMPT,
  ClarifyingQuestionsResponseSchema,
  CROSS_PROJECT_LINKS_SYSTEM_PROMPT,
  CrossProjectLinksResponseSchema,
  mapClarifyingQuestions,
  mapCrossProjectLinksSuggestions,
  mapProposalFromContextSuggestions,
  mapRiskProposalsSuggestions,
  mapTrajectorySequenceSuggestions,
  PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT,
  ProposalFromContextResponseSchema,
  RISK_PROPOSALS_SYSTEM_PROMPT,
  RiskProposalsResponseSchema,
  TRAJECTORY_SEQUENCE_SYSTEM_PROMPT,
  TrajectorySequenceResponseSchema,
} from "./graph-purpose-prompts"
import { runDocumentSummaryStrict } from "./document-summary-runner"
import { runWorkItemsFromIntent } from "./work-items-from-intent-runner"
import type {
  WorkItemsFromIntentGenerationOutput,
  WorkItemsFromIntentGenerationRequest,
} from "./types"

// ---------------------------------------------------------------------------
// Risk-suggestion schema + prompt (same shape as Anthropic / OpenAI / Ollama).
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
// AzureOpenAIProvider
// ---------------------------------------------------------------------------

export interface AzureOpenAIProviderConfig {
  /** Azure resource endpoint, e.g. https://my-res.openai.azure.com */
  endpoint: string
  /** Deployment name (Azure addresses models by deployment). */
  deployment: string
  /** Azure api-key (sent as the `api-key` header). */
  apiKey: string
  /** Required Azure api-version, e.g. 2024-10-21. */
  apiVersion: string
  /** PROJ-93: EU region of the Azure resource, recorded on ki_runs for
   *  trusted-processor Class-3 provenance. Optional (Class-1/2 don't need it). */
  region?: string | null
}

export class AzureOpenAIProvider implements AIProvider {
  readonly name = "azure" as const
  readonly modelId: string
  readonly region: string | null
  private readonly sdkProvider: ReturnType<typeof createOpenAICompatible>

  constructor(config: AzureOpenAIProviderConfig) {
    // Azure addresses the model by deployment name in the URL path; the body
    // `model` field mirrors the deployment.
    this.modelId = config.deployment
    this.region = config.region ?? null
    const base = config.endpoint.replace(/\/+$/, "")
    this.sdkProvider = createOpenAICompatible({
      name: "azure",
      baseURL: `${base}/openai/deployments/${config.deployment}`,
      headers: { "api-key": config.apiKey },
      queryParams: { "api-version": config.apiVersion },
      // PROJ-152: Zeitbudget fuer jeden Aufruf dieses Clients.
      fetch: createTimeoutFetch("azure", CLOUD_PROVIDER_TIMEOUT_MS),
    })
  }

  /**
   * PROJ-153-alpha — Arbeitspakete aus dem Vorhaben (AC-153H.2).
   */
  async generateWorkItemsFromIntent(
    request: WorkItemsFromIntentGenerationRequest,
  ): Promise<WorkItemsFromIntentGenerationOutput> {
    return runWorkItemsFromIntent(this.sdkProvider(this.modelId), request)
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

  async generateProposalFromContext(
    request: ProposalFromContextGenerationRequest,
  ): Promise<ProposalFromContextGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: ProposalFromContextResponseSchema,
      system: PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT,
      prompt: buildProposalFromContextPrompt(request),
      temperature: 0.3,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined
    return {
      suggestions: mapProposalFromContextSuggestions(result.object.suggestions),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  async generateRiskProposals(
    request: RiskProposalsGenerationRequest,
  ): Promise<RiskProposalsGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: RiskProposalsResponseSchema,
      system: RISK_PROPOSALS_SYSTEM_PROMPT,
      prompt: buildRiskProposalsPrompt(request),
      temperature: 0.3,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined
    return {
      suggestions: mapRiskProposalsSuggestions(
        result.object.suggestions,
        new Set(request.context.existing_risks.map((r) => r.risk_id)),
      ),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  async generateClarifyingQuestions(
    request: ClarifyingQuestionsGenerationRequest,
  ): Promise<ClarifyingQuestionsGenerationOutput> {
    const start = Date.now()
    const result = await generateObject({
      model: this.sdkProvider(this.modelId),
      schema: ClarifyingQuestionsResponseSchema,
      system: CLARIFYING_QUESTIONS_SYSTEM_PROMPT,
      prompt: buildClarifyingQuestionsPrompt(request),
      temperature: 0.3,
    })
    const usage = result.usage as
      | { inputTokens?: number; outputTokens?: number }
      | undefined
    return {
      questions: mapClarifyingQuestions(result.object.questions),
      usage: {
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
        latency_ms: Date.now() - start,
      },
    }
  }

  // PROJ-80-α — Quintessenz. Der Aufruf lebt im geteilten Runner, damit die
  // sechs Anbieter nicht auseinanderlaufen (PROJ-85-Lehre).
  async generateDocumentSummary(
    request: DocumentSummaryGenerationRequest,
  ): Promise<DocumentSummaryGenerationOutput> {
    return runDocumentSummaryStrict(this.sdkProvider(this.modelId), request.context)
  }

  /** PROJ-151-α — Chat-Antwort über den geteilten Runner. */
  async generateProjectChat(
    request: ProjectChatGenerationRequest,
  ): Promise<ProjectChatGenerationOutput> {
    return runProjectChat(this.sdkProvider(this.modelId), request.context)
  }
}
