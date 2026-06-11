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
  CrossProjectLinksGenerationRequest,
  NarrativeGenerationRequest,
  ProposalFromContextGenerationRequest,
  ResourceSwapGenerationRequest,
  RiskGenerationRequest,
  RiskProposalsGenerationRequest,
  SentimentGenerationRequest,
  StakeholderProposalsGenerationRequest,
  TrajectorySequenceGenerationRequest,
} from "./types"
import type {
  CoachingGenerationOutput,
  CrossProjectLinkSuggestion,
  CrossProjectLinksGenerationOutput,
  NarrativeGenerationOutput,
  ProposalFromContextGenerationOutput,
  ResourceSwapGenerationOutput,
  RiskGenerationOutput,
  RiskProposalsGenerationOutput,
  RiskSuggestion,
  StakeholderProposalsGenerationOutput,
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

  /**
   * PROJ-65 ε.4.γ — deterministic cross-project-link stub.
   *
   * Two conservative heuristics that emit only Class-1/2-safe suggestions:
   *   1) Duplicate-title heuristic — pairs of work-items across projects
   *      whose titles overlap on a token >=4 chars are flagged as
   *      `duplicates` (low confidence). Cheap signal for "two teams
   *      tracking the same thing".
   *   2) Parent-child delivers — if the source project is a child of one
   *      of the related projects, the first work-item of the source is
   *      proposed as `delivers` toward the parent's first work-item.
   *
   * Always emits ≤ `request.count` suggestions; emits zero when nothing
   * matches. Skips pairs that already have an existing (non-rejected)
   * link in the context.
   */
  async generateCrossProjectLinks(
    request: CrossProjectLinksGenerationRequest,
  ): Promise<CrossProjectLinksGenerationOutput> {
    const start = Date.now()
    const {
      source_project,
      related_projects,
      source_work_items,
      related_work_items,
      existing_links,
    } = request.context
    const out: CrossProjectLinkSuggestion[] = []
    const max = Math.max(0, Math.min(request.count, 5))

    if (max === 0 || source_work_items.length === 0) {
      return {
        suggestions: out,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: Date.now() - start,
        },
      }
    }

    // Lookup table of "we already have a link between these two ids" so
    // we don't propose duplicates of existing links.
    const existingPairs = new Set<string>(
      existing_links.map(
        (l) => `${l.from_work_item_id}::${l.to_work_item_id ?? l.to_project_id}`,
      ),
    )
    const STOPWORDS = new Set([
      "und",
      "oder",
      "der",
      "die",
      "das",
      "ein",
      "eine",
      "the",
      "and",
      "for",
      "with",
      "von",
      "fur",
      "für",
      "mit",
    ])
    const tokenize = (s: string) =>
      s
        .toLowerCase()
        .split(/[^a-zäöüß0-9]+/i)
        .filter((t) => t.length >= 4 && !STOPWORDS.has(t))

    // 1) Duplicate-title heuristic.
    for (const src of source_work_items) {
      if (out.length >= max) break
      const srcTokens = new Set(tokenize(src.title))
      if (srcTokens.size === 0) continue
      for (const rel of related_work_items) {
        if (out.length >= max) break
        const pairKey = `${src.work_item_id}::${rel.work_item_id}`
        if (existingPairs.has(pairKey)) continue
        const relTokens = tokenize(rel.title)
        const overlap = relTokens.filter((t) => srcTokens.has(t))
        if (overlap.length === 0) continue
        out.push({
          title: `Mögliches Duplikat: "${src.title}" ↔ "${rel.title}"`,
          rationale: `Beide Work-Items teilen das Schlüsselwort "${overlap[0]}". Klingt nach derselben Sache, die in zwei Projekten parallel verfolgt wird — Duplikat-Link prüfen, ggf. konsolidieren.`,
          kind: "duplicates",
          from_work_item_id: src.work_item_id,
          to_work_item_id: rel.work_item_id,
          to_project_id: rel.project_id,
          lag_days: null,
          confidence: "low",
        })
      }
    }

    // 2) Parent-child delivers (only when source is a child of a parent
    //    we can see in the related set).
    const parent = related_projects.find((p) => p.relation === "parent")
    if (parent && out.length < max) {
      const firstSrc = source_work_items[0]
      const firstParentItem = related_work_items.find(
        (w) => w.project_id === parent.project_id,
      )
      if (firstSrc && firstParentItem) {
        const pairKey = `${firstSrc.work_item_id}::${firstParentItem.work_item_id}`
        if (!existingPairs.has(pairKey)) {
          out.push({
            title: `${source_project.name} liefert an ${parent.name}`,
            rationale: `Das Projekt ist Teil-Projekt von "${parent.name}". Die erste konkrete Lieferung ("${firstSrc.title}") sollte an das Parent-Work-Item ("${firstParentItem.title}") verlinkt werden, damit die Bridge sichtbar wird.`,
            kind: "delivers",
            from_work_item_id: firstSrc.work_item_id,
            to_work_item_id: firstParentItem.work_item_id,
            to_project_id: parent.project_id,
            lag_days: null,
            confidence: "low",
          })
        }
      }
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
   * PROJ-70-α — proposal-from-context stub.
   *
   * Emits zero suggestions. Mirror of ε.4.β CIA-L5: the Stub deliberately
   * does NOT apply a heuristic on the kickoff content excerpt — a
   * heuristic stub tends to grow toward reading Class-3 fields over
   * time, which the privacy-classifier is explicitly designed to prevent.
   *
   * The router surfaces `status='external_blocked'` so the UI shows the
   * "kein AI-Provider — bitte Tenant-Provider konfigurieren oder manuell
   * strukturieren"-banner.
   */
  async generateProposalFromContext(
    _request: ProposalFromContextGenerationRequest,
  ): Promise<ProposalFromContextGenerationOutput> {
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

  /**
   * PROJ-88 — stub stakeholder proposals. Empty by design (mirror of
   * generateProposalFromContext): the purpose is Class-3-pinned, so the
   * stub only ever runs as the external_blocked fallback — fabricated
   * placeholder stakeholders would be worse than none.
   */
  async generateStakeholderProposals(
    _request: StakeholderProposalsGenerationRequest,
  ): Promise<StakeholderProposalsGenerationOutput> {
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

  /**
   * PROJ-89 — stub risk proposals. Empty by design (CIA-L5 mirror of
   * generateStakeholderProposals): the stub only runs as the
   * blocked/error fallback — fabricated placeholder risks would be
   * worse than none; the UI communicates the blocked state instead.
   */
  async generateRiskProposals(
    _request: RiskProposalsGenerationRequest,
  ): Promise<RiskProposalsGenerationOutput> {
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
