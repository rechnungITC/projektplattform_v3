/**
 * PROJ-12 + PROJ-30 — Stub provider.
 *
 * Deterministic fake AI provider. Used:
 *   - automatically as fallback when ANTHROPIC_API_KEY is missing or when
 *     the router routes locally (Class-3 payload, EXTERNAL_AI_DISABLED, …)
 *     and Ollama isn't wired yet;
 *   - in vitest (no API key, no quota, no flakiness);
 *   - for local dev demos and stand-alone bootstrap.
 *
 * The shape is identical to what the Anthropic provider returns so the
 * downstream pipeline doesn't care which provider produced the data.
 *
 * PROJ-30: extended to implement `generateNarrative` — returns a templated
 * 3-sentence text shaped by the snapshot kind. This becomes the
 * canonical local-only fallback for the PROJ-21 KI-Kurzfazit feature.
 */

import type {
  AIProvider,
  CoachingGenerationRequest,
  NarrativeGenerationRequest,
  ResourceSwapGenerationRequest,
  RiskGenerationRequest,
  SentimentGenerationRequest,
  TrajectorySequenceGenerationRequest,
} from "./types"
import type {
  CoachingGenerationOutput,
  NarrativeGenerationOutput,
  ResourceSwapGenerationOutput,
  RiskGenerationOutput,
  RiskSuggestion,
  TrajectorySequenceGenerationOutput,
  TrajectorySequenceSuggestion,
  SentimentGenerationOutput,
} from "../types"

const TEMPLATES: Array<Omit<RiskSuggestion, "title"> & { titleSeed: string }> = [
  {
    titleSeed: "Verzögerung der Datenmigration",
    description:
      "Die Datenmigration aus Altsystemen kann durch fehlende Datenqualität oder unklare Mappings ausbremsen.",
    probability: 3,
    impact: 4,
    status: "open",
    mitigation:
      "Frühe Datenqualitäts-Stichproben, dedizierte Migrations-Sprints, Fallback-Plan für Teil-Cutover.",
  },
  {
    titleSeed: "Fehlende Verfügbarkeit von Key-Usern",
    description:
      "Key-User aus den Fachbereichen sind im Tagesgeschäft gebunden und können Tests + Schulung nicht in der geplanten Tiefe leisten.",
    probability: 4,
    impact: 3,
    status: "open",
    mitigation:
      "Verbindliche Freistellung mit Steering Committee abstimmen; Backup-Tester pro Bereich identifizieren.",
  },
  {
    titleSeed: "Schnittstellen zu Drittsystemen",
    description:
      "Schnittstellen-Spezifikationen Dritter sind unvollständig oder ändern sich kurzfristig.",
    probability: 3,
    impact: 3,
    status: "open",
    mitigation:
      "Schnittstellen-Workshops vor Spec-Ende; Vertragliche Stabilitätszusagen einfordern; Mock-Server für frühen Test.",
  },
  {
    titleSeed: "Compliance-Konformität (DSGVO/Betriebsrat)",
    description:
      "Externe Compliance-Auflagen (Betriebsrat, Datenschutzbeauftragter) führen zu Nachzügler-Anforderungen.",
    probability: 2,
    impact: 4,
    status: "open",
    mitigation:
      "Compliance-Stakeholder in Sprint-0 einbinden; DSGVO-Checkliste vor jeder Phase abarbeiten.",
  },
  {
    titleSeed: "Budgetüberschreitung durch Change-Requests",
    description:
      "Während der Umsetzung entstehen unvorhergesehene Anforderungen, die das Budget belasten.",
    probability: 3,
    impact: 3,
    status: "open",
    mitigation:
      "Strenges CR-Management mit Steering-Approval ab definierter Schwelle; Reserve-Budget einplanen.",
  },
  {
    titleSeed: "Akzeptanz im Fachbereich",
    description:
      "Endanwender:innen befürchten Mehraufwand oder Bedienkomplexität — Akzeptanz sinkt nach Go-Live.",
    probability: 3,
    impact: 3,
    status: "open",
    mitigation:
      "Frühe Hands-On-Sessions; Champions pro Abteilung; Support-Hotline in den ersten 4 Wochen post-Go-Live.",
  },
]

function tagFromContext(request: RiskGenerationRequest, idx: number): string {
  const projectName = request.context.project.name
  const tag = projectName ? ` · ${projectName}` : ""
  return `${TEMPLATES[idx % TEMPLATES.length]!.titleSeed}${tag}`
}

const NARRATIVE_FALLBACK_STATUS_REPORT =
  "Das Projekt befindet sich in der laufenden Umsetzung. Die wichtigsten Risiken sind aktiv betreut, die nächsten Meilensteine sind terminlich auf Kurs. Im nächsten Lenkungskreis stehen Phasenfreigabe und Budget-Status auf der Agenda."

const NARRATIVE_FALLBACK_EXEC_SUMMARY =
  "Das Projekt liegt im Plan. Top-Risiken sind unter Beobachtung. Nächster Meilenstein steht termingerecht."

export class StubProvider implements AIProvider {
  readonly name = "stub" as const
  readonly modelId = "stub-deterministic-v1"

  async generateRiskSuggestions(
    request: RiskGenerationRequest,
  ): Promise<RiskGenerationOutput> {
    const start = Date.now()
    const count = Math.max(1, Math.min(request.count, TEMPLATES.length))
    const suggestions = Array.from({ length: count }, (_, i) => {
      const t = TEMPLATES[i % TEMPLATES.length]!
      return {
        title: tagFromContext(request, i),
        description: t.description,
        probability: t.probability,
        impact: t.impact,
        status: t.status,
        mitigation: t.mitigation,
      }
    })

    return {
      suggestions,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
      },
    }
  }

  async generateNarrative(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationOutput> {
    const start = Date.now()
    const text =
      request.context.kind === "status_report"
        ? NARRATIVE_FALLBACK_STATUS_REPORT
        : NARRATIVE_FALLBACK_EXEC_SUMMARY

    return {
      text,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-34-γ.1 — deterministic sentiment fallback.
   *
   * Emits one neutral signal per participant (sentiment=0,
   * cooperation_signal=0, confidence=0.3). The downstream review queue
   * still requires a human accept/reject, so neutral defaults are safe.
   * Real providers (Anthropic etc.) will fill these with actual values
   * in a later slice; for now Stub keeps the pipeline running locally
   * and in Class-3 tenants without their own AI keys.
   */
  async generateSentiment(
    request: SentimentGenerationRequest,
  ): Promise<SentimentGenerationOutput> {
    const start = Date.now()
    const signals = request.context.participants.map((p) => ({
      stakeholder_id: p.stakeholder_id,
      sentiment: 0,
      cooperation_signal: 0,
      confidence: 0.3,
    }))
    return {
      signals,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-34-ε — coaching stub.
   *
   * Emits zero recommendations. Real providers fill the four kinds based
   * on the aggregated profile + interaction context; the Stub's job is
   * just to keep the pipeline running when a tenant has no compatible
   * provider — the UI surfaces an empty-state with the external-blocked
   * banner so the user knows manual coaching is the only path.
   */
  async generateCoaching(
    _request: CoachingGenerationRequest,
  ): Promise<CoachingGenerationOutput> {
    const start = Date.now()
    return {
      recommendations: [],
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-65 ε.4.α — deterministic trajectory-sequence stub.
   *
   * Picks up to 3 suggestions from the context shape, using only the
   * structural fields available. The output is intentionally conservative
   * so it stays useful as a fallback when no LLM provider is wired:
   *   - if ≥ 2 phases exist with overlapping date ranges → parallelize
   *   - if there's a phase followed by a sprint with no dependency edge
   *     → suggest "consider parallel" advisory
   *   - if 2+ adjacent phases share zero dependencies between them
   *     → suggest reorder by sequence_number
   *
   * Never emits more than `request.count` suggestions; emits at least 0
   * when the context is too small to derive anything sensible.
   */
  async generateTrajectorySequence(
    request: TrajectorySequenceGenerationRequest,
  ): Promise<TrajectorySequenceGenerationOutput> {
    const start = Date.now()
    const { phases, sprints, dependencies } = request.context
    const out: TrajectorySequenceSuggestion[] = []
    const max = Math.max(1, Math.min(request.count, 5))

    const depKey = (kind: string, id: string) => `${kind}:${id}`
    const dependsOn = new Set(
      dependencies.flatMap((d) => [
        depKey(d.from_type, d.from_id),
        depKey(d.to_type, d.to_id),
      ]),
    )

    // 1) Parallelisierungs-Heuristik: zwei Phasen, deren Datumsbereiche
    //    sich überlappen und die keine direkte Dependency teilen.
    for (let i = 0; i < phases.length && out.length < max; i++) {
      for (let j = i + 1; j < phases.length && out.length < max; j++) {
        const a = phases[i]!
        const b = phases[j]!
        if (!a.planned_start || !a.planned_end || !b.planned_start || !b.planned_end)
          continue
        const overlap =
          a.planned_start <= b.planned_end && b.planned_start <= a.planned_end
        if (!overlap) continue
        const aKey = depKey("phase", a.id)
        const bKey = depKey("phase", b.id)
        // Only suggest if neither side directly links to the other.
        if (dependsOn.has(aKey) && dependsOn.has(bKey)) continue
        out.push({
          title: `${a.name} und ${b.name} parallel führen`,
          rationale: `Die Phasen überlappen zeitlich (${a.planned_start}…${a.planned_end} vs. ${b.planned_start}…${b.planned_end}) und haben keine direkte Abhängigkeit. Parallele Ausführung kann das Gesamtende verkürzen.`,
          kind: "parallelize",
          affected_node_ids: [`phase:${a.id}`, `phase:${b.id}`],
          estimated_savings_days: null,
          confidence: "low",
        })
      }
    }

    // 2) Reorder-Heuristik: aufeinanderfolgende Sprints, deren Reihenfolge
    //    nicht durch eine Dependency erzwungen ist.
    for (let i = 0; i + 1 < sprints.length && out.length < max; i++) {
      const a = sprints[i]!
      const b = sprints[i + 1]!
      if (!a.start_date || !b.start_date) continue
      if (a.start_date <= b.start_date) continue
      // a starts after b — unusual ordering; suggest review.
      out.push({
        title: `Reihenfolge ${a.name} ↔ ${b.name} prüfen`,
        rationale: `Sprint "${a.name}" startet am ${a.start_date}, "${b.name}" bereits am ${b.start_date}. Diese Reihenfolge wirkt umkehrbar — Reorder kann den kritischen Pfad verkürzen.`,
        kind: "reorder",
        affected_node_ids: [`sprint:${a.id}`, `sprint:${b.id}`],
        estimated_savings_days: null,
        confidence: "low",
      })
    }

    return {
      suggestions: out,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
      },
    }
  }

  /**
   * PROJ-65 ε.4.β — resource-swap stub (Class-3 hard-fix path).
   *
   * Emits zero suggestions, mirroring sentiment + coaching. Per CIA-L5
   * (2026-05-28) the Stub deliberately does NOT apply a heuristic on
   * Class-1/2 fields here:
   *   - mixing heuristic and LLM output behind the same surface drifts
   *     the product behaviour between tenants with/without Ollama;
   *   - a heuristic implementation tends to grow toward reading Class-3
   *     fields over time (skill scores, rates) — exactly what the
   *     Class-3 hard-fix is meant to prevent.
   *
   * The router surfaces `status='external_blocked'` so the UI shows the
   * "kein lokaler Provider — manuelle Swap-Entscheidung erforderlich"
   * banner.
   */
  async generateResourceSwap(
    _request: ResourceSwapGenerationRequest,
  ): Promise<ResourceSwapGenerationOutput> {
    const start = Date.now()
    return {
      suggestions: [],
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        latency_ms: Date.now() - start,
      },
    }
  }
}

/**
 * Deprecated alias — keep import surface stable for Risk-only callers.
 */
export const StubRiskProvider = StubProvider
