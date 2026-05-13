import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { CoachingRecommendation } from "@/lib/stakeholder-coaching/api"

import { RecommendationCard } from "./recommendation-card"

function buildRec(overrides: Partial<CoachingRecommendation> = {}): CoachingRecommendation {
  return {
    id: "rec-1",
    tenant_id: "t1",
    project_id: "p1",
    stakeholder_id: "s1",
    recommendation_kind: "outreach",
    recommendation_text: "Bitte um ein 15-Minuten-Update vereinbaren.",
    modified_text: null,
    review_state: "draft",
    cited_interaction_ids: ["i1"],
    cited_profile_fields: ["big5_neuroticism"],
    provider: "anthropic",
    model_id: "claude-opus-4-7",
    confidence: 0.73,
    ki_run_id: "run-1",
    prompt_context_meta: { tonality_hint: "sachlich, datengetrieben" },
    created_by: "u1",
    created_at: "2026-05-13T15:00:00Z",
    updated_at: "2026-05-13T15:00:00Z",
    ...overrides,
  }
}

describe("RecommendationCard", () => {
  const baseInteractionMap = new Map([["i1", "13.05.26 · meeting"]])
  const baseProfileMap = new Map([["big5_neuroticism", "Big5: Neurotizismus"]])

  it("renders kind badge + decision chip + text + citations + tonality hint", () => {
    const onDecision = vi.fn()
    render(
      <RecommendationCard
        recommendation={buildRec()}
        interactionLabelMap={baseInteractionMap}
        profileFieldLabelMap={baseProfileMap}
        canEdit
        onDecision={onDecision}
      />,
    )
    expect(screen.getByTestId("kind-badge-outreach")).toHaveTextContent(
      "Outreach",
    )
    expect(screen.getByText(/offen/i)).toBeInTheDocument()
    expect(
      screen.getByText("Bitte um ein 15-Minuten-Update vereinbaren."),
    ).toBeInTheDocument()
    expect(screen.getByText(/13\.05\.26/i)).toBeInTheDocument()
    expect(screen.getByText(/Big5: Neurotizismus/i)).toBeInTheDocument()
    expect(screen.getByText(/sachlich, datengetrieben/i)).toBeInTheDocument()
    expect(screen.getByText(/73%/)).toBeInTheDocument()
  })

  it("calls onDecision with accept when Übernehmen is clicked", async () => {
    const onDecision = vi.fn().mockResolvedValue(undefined)
    render(
      <RecommendationCard
        recommendation={buildRec()}
        interactionLabelMap={baseInteractionMap}
        profileFieldLabelMap={baseProfileMap}
        canEdit
        onDecision={onDecision}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Übernehmen/i }))
    expect(onDecision).toHaveBeenCalledWith({
      recommendation_id: "rec-1",
      decision: "accept",
    })
  })

  it("hides actions when canEdit=false", () => {
    render(
      <RecommendationCard
        recommendation={buildRec()}
        interactionLabelMap={baseInteractionMap}
        profileFieldLabelMap={baseProfileMap}
        canEdit={false}
        onDecision={() => {}}
      />,
    )
    expect(screen.queryByTestId("recommendation-actions")).toBeNull()
  })

  it("shows modified_text when review_state is 'modified'", () => {
    render(
      <RecommendationCard
        recommendation={buildRec({
          review_state: "modified",
          modified_text: "Vorsichtiger Ton: erstmal Hintergrund klären.",
        })}
        interactionLabelMap={baseInteractionMap}
        profileFieldLabelMap={baseProfileMap}
        canEdit
        onDecision={() => {}}
      />,
    )
    expect(
      screen.getByText("Vorsichtiger Ton: erstmal Hintergrund klären."),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Bitte um ein 15-Minuten/)).toBeNull()
    expect(screen.getByText(/geändert/i)).toBeInTheDocument()
  })

  it("renders fallback label for missing cited interaction id", () => {
    render(
      <RecommendationCard
        recommendation={buildRec({ cited_interaction_ids: ["i-deleted"] })}
        interactionLabelMap={new Map()}
        profileFieldLabelMap={baseProfileMap}
        canEdit
        onDecision={() => {}}
      />,
    )
    expect(
      screen.getByText(/Quelle nicht mehr verfügbar/i),
    ).toBeInTheDocument()
  })
})
