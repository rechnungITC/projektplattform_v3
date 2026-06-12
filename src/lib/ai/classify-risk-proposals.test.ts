/**
 * PROJ-89 — classifier tests for `proposal_risks_from_context`.
 *
 * Unlike PROJ-88 (Class-3 pin), this purpose is content-classified
 * (AC-89.2): clean business documents stay at their stamped class and may
 * route to cloud; PII markers in the excerpt OR the Vorhaben (PROJ-91
 * defense-in-depth) force Class 3; the upload-time privacy_class acts as
 * a floor that marker detection can only raise, never lower.
 */
import { describe, expect, it } from "vitest"

import { classifyRiskProposalsAutoContext } from "./classify"
import type { RiskProposalsAutoContext } from "./types"

function ctx(
  overrides: {
    privacy_class?: 1 | 2 | 3
    excerpt?: string
    description?: string | null
  } = {},
): RiskProposalsAutoContext {
  return {
    source_project: {
      project_id: "p1",
      name: "ERP Implementierung",
      description:
        overrides.description === undefined
          ? "ERP-System einführen."
          : overrides.description,
      project_type: "erp",
      project_method: "waterfall",
      lifecycle_status: "active",
    },
    context_source: {
      context_source_id: "c1",
      kind: "document",
      title: "Kickoff.docx",
      privacy_class: overrides.privacy_class ?? 2,
      content_excerpt:
        overrides.excerpt ??
        "Das Projekt startet im Q3. Die Datenmigration aus dem Altsystem ist kritisch.",
      language: "de",
    },
    existing_risks: [],
  }
}

describe("classifyRiskProposalsAutoContext (PROJ-89, AC-89.2)", () => {
  it("keeps a clean Class-2 document at Class 2 (cloud-capable)", () => {
    expect(classifyRiskProposalsAutoContext(ctx())).toBe(2)
  })

  it("honours the privacy_class floor — a stamped Class-3 source never drops", () => {
    expect(classifyRiskProposalsAutoContext(ctx({ privacy_class: 3 }))).toBe(3)
  })

  it("upgrades to Class 3 on PII markers in the excerpt (post-PROJ-86 detection)", () => {
    expect(
      classifyRiskProposalsAutoContext(
        ctx({ excerpt: "Rückfragen an max.mustermann@acme.example bitte." }),
      ),
    ).toBe(3)
  })

  it("upgrades to Class 3 on PII markers in the Vorhaben (PROJ-91 defense-in-depth)", () => {
    expect(
      classifyRiskProposalsAutoContext(
        ctx({ description: "Ansprechpartner: anna.berger@acme.example" }),
      ),
    ).toBe(3)
  })

  it("does not over-trigger on plain German business text (PROJ-86 regression guard)", () => {
    expect(
      classifyRiskProposalsAutoContext(
        ctx({
          excerpt:
            "Lead Scoring und Vertriebsprozesse werden im neuen System abgebildet. Die Schnittstellen zur Finanzbuchhaltung sind zu klären.",
        }),
      ),
    ).toBe(2)
  })
})
