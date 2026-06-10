import { describe, expect, it } from "vitest"

import type { StakeholderProposalsGenerationRequest } from "./types"
import {
  buildStakeholderProposalsPromptOllama,
  STAKEHOLDER_PROPOSALS_SYSTEM_PROMPT_OLLAMA,
} from "./ollama"

function req(
  description: string | null,
  existing: StakeholderProposalsGenerationRequest["context"]["existing_stakeholders"] = [],
): StakeholderProposalsGenerationRequest {
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
        privacy_class: 3,
        content_excerpt: "Inhalt des Kickoffs.",
        language: "de",
      },
      existing_stakeholders: existing,
    },
  }
}

describe("PROJ-88 stakeholder-proposals prompt — AC-88.9 grounding contract", () => {
  /**
   * Contract guard mirroring the PROJ-91 incident (2026-06-10): the
   * Vorhaben must be the relevance YARDSTICK only — never a generation
   * source. Asserts the invariant phrases AND the absence of the
   * generation-imperative wording that caused the original over-steer.
   */
  it("keeps the Vorhaben a relevance yardstick, never a proposal source", () => {
    expect(STAKEHOLDER_PROPOSALS_SYSTEM_PROMPT_OLLAMA).toContain(
      "AUSSCHLIESSLICH aus dem Kickoff-Dokument",
    )
    expect(STAKEHOLDER_PROPOSALS_SYSTEM_PROMPT_OLLAMA).toContain(
      "Erfinde KEINE Stakeholder aus dem Vorhaben",
    )
    expect(STAKEHOLDER_PROPOSALS_SYSTEM_PROMPT_OLLAMA).toContain(
      "ERFINDE NIEMALS Namen",
    )
    expect(STAKEHOLDER_PROPOSALS_SYSTEM_PROMPT_OLLAMA).not.toContain(
      "richte deine Vorschläge primär am Vorhaben aus",
    )

    const prompt = buildStakeholderProposalsPromptOllama(
      req("ERP-System auf Basis von MS Dynamics einführen."),
    )
    expect(prompt).toContain("NUR Bewertungsmaßstab für relevance")
    expect(prompt).toContain("KEINE Quelle für Vorschläge")
    expect(prompt).toContain("MS Dynamics")
    expect(prompt).not.toContain("richte die Vorschläge hieran aus")
  })

  it("emits the no-Vorhaben note when description is null/empty", () => {
    expect(buildStakeholderProposalsPromptOllama(req(null))).toContain(
      "Kein Vorhaben hinterlegt",
    )
    expect(buildStakeholderProposalsPromptOllama(req("   "))).toContain(
      "Kein Vorhaben hinterlegt",
    )
  })

  it("lists existing stakeholders with ids for dedup", () => {
    const prompt = buildStakeholderProposalsPromptOllama(
      req("Ziel", [
        {
          stakeholder_id: "11111111-1111-1111-1111-111111111111",
          name: "Maria Beispiel",
          kind: "person",
          role_key: "Projektleiterin",
        },
      ]),
    )
    expect(prompt).toContain("Vorhandene Stakeholder")
    expect(prompt).toContain("id=11111111-1111-1111-1111-111111111111")
    expect(prompt).toContain("Maria Beispiel")
    expect(prompt).toContain("Projektleiterin")
  })

  it("shows '(keine)' when the project has no stakeholders yet", () => {
    expect(buildStakeholderProposalsPromptOllama(req("Ziel"))).toContain(
      "(keine)",
    )
  })
})
