import { describe, expect, it } from "vitest"

import { AnthropicProvider } from "./anthropic"
import { GoogleProvider } from "./google"
import {
  buildProposalFromContextPrompt,
  buildRiskProposalsPrompt,
  mapCrossProjectLinksSuggestions,
  mapProposalFromContextSuggestions,
  mapRiskProposalsSuggestions,
  mapTrajectorySequenceSuggestions,
  PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT,
  RISK_PROPOSALS_SYSTEM_PROMPT,
} from "./graph-purpose-prompts"
import {
  buildProposalFromContextPromptOllama,
  PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT_OLLAMA,
} from "./ollama"
import { OpenAIProvider } from "./openai"
import type {
  CrossProjectLinksGenerationRequest,
  ProposalFromContextGenerationRequest,
  RiskProposalsGenerationRequest,
} from "./types"

/**
 * Regression guard for the 2026-06-08 incident: OpenAI/Google silently fell
 * back to the Stub for every Graph proposal because the provider classes
 * never implemented the methods. The router only discovers this at call
 * time ("Provider openai does not implement generateTrajectorySequence").
 * These presence checks fail at build/test time instead.
 */
describe("cloud-provider Graph-purpose parity", () => {
  const providers = [
    new AnthropicProvider({ apiKey: "test" }),
    new OpenAIProvider({ apiKey: "test" }),
    new GoogleProvider({ apiKey: "test" }),
  ]

  for (const provider of providers) {
    it(`${provider.name} implements all Graph-family methods`, () => {
      expect(typeof provider.generateTrajectorySequence).toBe("function")
      expect(typeof provider.generateCrossProjectLinks).toBe("function")
      expect(typeof provider.generateProposalFromContext).toBe("function")
      // baseline purposes that pre-date the Graph family
      expect(typeof provider.generateRiskSuggestions).toBe("function")
      expect(typeof provider.generateNarrative).toBe("function")
    })
  }
})

describe("mapTrajectorySequenceSuggestions", () => {
  it("maps fields and defaults estimated_savings_days to null", () => {
    const out = mapTrajectorySequenceSuggestions([
      {
        title: "Phase A und Phase B parallelisieren",
        rationale: "Beide überlappen zeitlich ohne Dependency.",
        kind: "parallelize",
        affected_node_ids: ["phase:" + "0".repeat(36)],
        confidence: "high",
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]!.estimated_savings_days).toBeNull()
    expect(out[0]!.kind).toBe("parallelize")
  })
})

describe("mapCrossProjectLinksSuggestions", () => {
  const A = "11111111-1111-1111-1111-111111111111"
  const B = "22222222-2222-2222-2222-222222222222"
  const PSRC = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  const PREL = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
  const POUT = "cccccccc-cccc-cccc-cccc-cccccccccccc"

  const request = {
    context: {
      source_project: {
        project_id: PSRC,
        name: "Src",
        project_type: null,
        project_method: null,
        lifecycle_status: "active",
      },
      related_projects: [
        {
          project_id: PREL,
          name: "Rel",
          project_type: null,
          project_method: null,
          lifecycle_status: "active",
        },
      ],
      source_work_items: [
        { work_item_id: A, kind: "story", status: "open", title: "A" },
      ],
      related_work_items: [
        { work_item_id: B, kind: "story", status: "open", title: "B" },
      ],
      existing_links: [],
    },
    count: 5,
  } as unknown as CrossProjectLinksGenerationRequest

  it("keeps in-scope suggestions", () => {
    const out = mapCrossProjectLinksSuggestions(
      [
        {
          title: "A liefert an B",
          rationale: "A erzeugt Output den B braucht.",
          kind: "delivers",
          from_work_item_id: A,
          to_work_item_id: B,
          to_project_id: PREL,
          confidence: "medium",
        },
      ],
      request,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.lag_days).toBeNull()
  })

  it("drops a suggestion whose from-item is not in source set", () => {
    const out = mapCrossProjectLinksSuggestions(
      [
        {
          title: "Hallucinated link",
          rationale: "from-id is not in context.",
          kind: "relates",
          from_work_item_id: B, // B is a related item, not a source item
          to_work_item_id: A,
          to_project_id: PSRC,
          confidence: "low",
        },
      ],
      request,
    )
    expect(out).toHaveLength(0)
  })

  it("drops a suggestion targeting an out-of-scope project", () => {
    const out = mapCrossProjectLinksSuggestions(
      [
        {
          title: "Out of scope project",
          rationale: "to_project_id not in scope.",
          kind: "relates",
          from_work_item_id: A,
          to_work_item_id: null,
          to_project_id: POUT,
          confidence: "low",
        },
      ],
      request,
    )
    expect(out).toHaveLength(0)
  })
})

describe("mapProposalFromContextSuggestions", () => {
  it("maps fields and defaults description to null", () => {
    const out = mapProposalFromContextSuggestions([
      {
        temp_id: "t_1",
        parent_temp_id: null,
        kind: "epic",
        title: "Datenmigration aus Altsystem X",
        description: null,
        confidence: "high",
        relevance: "on_goal",
      },
      {
        temp_id: "t_2",
        parent_temp_id: "t_1",
        kind: "story",
        title: "Mapping-Tabelle erstellen",
        description: "Feldzuordnung Alt → Neu.",
        confidence: "medium",
        relevance: "off_goal",
      },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]!.description).toBeNull()
    expect(out[0]!.relevance).toBe("on_goal")
    expect(out[1]!.parent_temp_id).toBe("t_1")
    expect(out[1]!.relevance).toBe("off_goal")
  })
})

describe("buildProposalFromContextPrompt — PROJ-91 grounding", () => {
  function req(
    description: string | null,
  ): ProposalFromContextGenerationRequest {
    return {
      count: 10,
      context: {
        source_project: {
          project_id: "p1",
          name: "ERP Implementierung",
          description,
          project_type: "erp",
          project_method: "scrum",
          lifecycle_status: "active",
        },
        context_source: {
          context_source_id: "c1",
          kind: "document",
          title: "Kickoff.docx",
          privacy_class: 2,
          content_excerpt: "Inhalt des Kickoffs.",
          language: "de",
        },
        method_hint: "scrum",
      },
    }
  }

  it("renders the Vorhaben block when description is present", () => {
    const prompt = buildProposalFromContextPrompt(
      req("ERP-System auf Basis von MS Dynamics einführen."),
    )
    expect(prompt).toContain("Vorhaben (Projektziel")
    expect(prompt).toContain("MS Dynamics")
  })

  it("emits the no-Vorhaben note when description is null/empty", () => {
    expect(buildProposalFromContextPrompt(req(null))).toContain(
      "Kein Vorhaben hinterlegt",
    )
    expect(buildProposalFromContextPrompt(req("   "))).toContain(
      "Kein Vorhaben hinterlegt",
    )
  })

  /**
   * Contract guard for the 2026-06-10 grounding incident (AC-91.7 live A/B):
   * the original wording "richte die Vorschläge am Vorhaben aus" made the
   * Vorhaben a GENERATION source — the model discarded the kickoff content
   * and invented an on-goal backlog, so `off_goal` never fired and items
   * lost source traceability (architecture principle #2). The Vorhaben must
   * be the relevance YARDSTICK only; items come exclusively from the kickoff.
   * Asserted on both the shared prompt and the Ollama replicate so neither
   * can silently regress to the generation-imperative wording.
   */
  it("keeps the Vorhaben a relevance yardstick, never an item source (shared)", () => {
    expect(PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT).toContain(
      "AUSSCHLIESSLICH aus dem Kickoff-Dokument",
    )
    expect(PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT).toContain(
      "Erfinde KEINE Items aus dem Vorhaben",
    )
    expect(PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT).not.toContain(
      "richte deine Vorschläge primär am Vorhaben aus",
    )

    const prompt = buildProposalFromContextPrompt(
      req("ERP-System auf Basis von MS Dynamics einführen."),
    )
    expect(prompt).toContain("NUR Bewertungsmaßstab für relevance")
    expect(prompt).toContain("KEINE Quelle für Items")
    expect(prompt).not.toContain("richte die Vorschläge hieran aus")
  })

  it("keeps the Vorhaben a relevance yardstick, never an item source (Ollama replicate)", () => {
    expect(PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT_OLLAMA).toContain(
      "AUSSCHLIESSLICH aus dem Kickoff-Dokument",
    )
    expect(PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT_OLLAMA).toContain(
      "Erfinde KEINE Items aus dem Vorhaben",
    )
    expect(PROPOSAL_FROM_CONTEXT_SYSTEM_PROMPT_OLLAMA).not.toContain(
      "richte deine Vorschläge primär am Vorhaben aus",
    )

    const prompt = buildProposalFromContextPromptOllama(
      req("ERP-System auf Basis von MS Dynamics einführen."),
    )
    expect(prompt).toContain("NUR Bewertungsmaßstab für relevance")
    expect(prompt).toContain("KEINE Quelle für Items")
    expect(prompt).not.toContain("richte die Vorschläge hieran aus")
  })
})

// ---------------------------------------------------------------------------
// PROJ-89 — risk proposals: AC-89.9 grounding contract + mapper guards
// ---------------------------------------------------------------------------

function riskReq(description: string | null): RiskProposalsGenerationRequest {
  return {
    count: 10,
    context: {
      source_project: {
        project_id: "p1",
        name: "ERP Implementierung",
        description,
        project_type: "erp",
        project_method: "waterfall",
        lifecycle_status: "active",
      },
      context_source: {
        context_source_id: "c1",
        kind: "document",
        title: "Kickoff.docx",
        privacy_class: 2,
        content_excerpt: "Inhalt des Kickoffs.",
        language: "de",
      },
      existing_risks: [
        {
          risk_id: "r1",
          title: "Datenmigration verzögert sich",
          probability: 3,
          impact: 4,
          status: "open",
        },
      ],
    },
  }
}

describe("buildRiskProposalsPrompt — AC-89.9 grounding (PROJ-91 track invariant)", () => {
  it("renders the Vorhaben block when description is present", () => {
    const prompt = buildRiskProposalsPrompt(
      riskReq("ERP-System auf Basis von MS Dynamics einführen."),
    )
    expect(prompt).toContain("Vorhaben (Projektziel")
    expect(prompt).toContain("MS Dynamics")
  })

  it("emits the no-Vorhaben note when description is null/empty", () => {
    expect(buildRiskProposalsPrompt(riskReq(null))).toContain(
      "Kein Vorhaben hinterlegt",
    )
    expect(buildRiskProposalsPrompt(riskReq("   "))).toContain(
      "Kein Vorhaben hinterlegt",
    )
  })

  it("lists existing risks with ids for dedup", () => {
    const prompt = buildRiskProposalsPrompt(riskReq(null))
    expect(prompt).toContain("id=r1")
    expect(prompt).toContain("Datenmigration verzögert sich")
    expect(prompt).toContain("duplicate_of_risk_id")
  })

  /**
   * AC-89.9 contract guard (mirror of the PROJ-91/PROJ-88 incident guard):
   * the Vorhaben must be the relevance YARDSTICK only; risks come
   * exclusively from the kickoff document. The generation-imperative
   * wording that caused the AC-91.7 over-steer must never appear.
   */
  it("keeps the Vorhaben a relevance yardstick, never a risk source", () => {
    expect(RISK_PROPOSALS_SYSTEM_PROMPT).toContain(
      "AUSSCHLIESSLICH aus dem Kickoff-Dokument",
    )
    expect(RISK_PROPOSALS_SYSTEM_PROMPT).toContain(
      "Erfinde KEINE Risiken aus dem Vorhaben",
    )
    expect(RISK_PROPOSALS_SYSTEM_PROMPT).not.toContain(
      "richte deine Vorschläge primär am Vorhaben aus",
    )

    const prompt = buildRiskProposalsPrompt(
      riskReq("ERP-System auf Basis von MS Dynamics einführen."),
    )
    expect(prompt).toContain("NUR Bewertungsmaßstab für relevance")
    expect(prompt).toContain("KEINE Quelle für Vorschläge")
    expect(prompt).not.toContain("richte die Vorschläge hieran aus")
  })
})

describe("mapRiskProposalsSuggestions", () => {
  const valid = new Set(["r1"])

  it("maps fields, clamps lengths, rounds + clamps probability/impact", () => {
    const out = mapRiskProposalsSuggestions(
      [
        {
          title: `  ${"T".repeat(300)}  `,
          description: "D".repeat(6000),
          probability: 7.4,
          impact: 0,
          mitigation: "   ",
          duplicate_of_risk_id: null,
          source_quote: "Q".repeat(400),
          confidence: "high",
          relevance: "on_goal",
        },
      ],
      valid,
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.title).toHaveLength(255)
    expect(out[0]!.description).toHaveLength(5000)
    expect(out[0]!.probability).toBe(5)
    expect(out[0]!.impact).toBe(1)
    expect(out[0]!.mitigation).toBeNull()
    expect(out[0]!.source_quote).toHaveLength(300)
  })

  it("keeps a valid duplicate_of_risk_id and nulls hallucinated ids", () => {
    const out = mapRiskProposalsSuggestions(
      [
        {
          title: "Bekanntes Risiko",
          description: null,
          probability: 3,
          impact: 3,
          mitigation: null,
          duplicate_of_risk_id: "r1",
          source_quote: null,
          confidence: "medium",
          relevance: "on_goal",
        },
        {
          title: "Halluziniertes Duplikat",
          description: null,
          probability: 2,
          impact: 2,
          mitigation: null,
          duplicate_of_risk_id: "r-does-not-exist",
          source_quote: null,
          confidence: "low",
          relevance: "off_goal",
        },
      ],
      valid,
    )
    expect(out[0]!.duplicate_of_risk_id).toBe("r1")
    expect(out[1]!.duplicate_of_risk_id).toBeNull()
    expect(out[1]!.relevance).toBe("off_goal")
  })
})
