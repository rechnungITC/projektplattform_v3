import { describe, expect, it } from "vitest"

import { AnthropicProvider } from "./anthropic"
import { GoogleProvider } from "./google"
import {
  mapCrossProjectLinksSuggestions,
  mapProposalFromContextSuggestions,
  mapTrajectorySequenceSuggestions,
} from "./graph-purpose-prompts"
import { OpenAIProvider } from "./openai"
import type { CrossProjectLinksGenerationRequest } from "./types"

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
      },
      {
        temp_id: "t_2",
        parent_temp_id: "t_1",
        kind: "story",
        title: "Mapping-Tabelle erstellen",
        description: "Feldzuordnung Alt → Neu.",
        confidence: "medium",
      },
    ])
    expect(out).toHaveLength(2)
    expect(out[0]!.description).toBeNull()
    expect(out[1]!.parent_temp_id).toBe("t_1")
  })
})
