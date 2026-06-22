/**
 * PROJ-135 — classifier tests for `clarifying_questions_from_context`.
 *
 * Content-classified (AC-135.2, mirror of PROJ-89): clean business kickoffs
 * stay at their stamped class and may route to cloud; PII markers in the
 * excerpt OR the Vorhaben (PROJ-91 defense-in-depth) force Class 3; the
 * upload-time privacy_class is a floor that marker detection can only raise.
 */
import { describe, expect, it } from "vitest"

import { classifyClarifyingQuestionsAutoContext } from "./classify"
import type { ClarifyingQuestionsAutoContext } from "./types"

function ctx(
  overrides: {
    privacy_class?: 1 | 2 | 3
    excerpt?: string
    description?: string | null
  } = {},
): ClarifyingQuestionsAutoContext {
  return {
    source_project: {
      name: "ERP Implementierung",
      description:
        overrides.description === undefined
          ? "ERP-System einführen."
          : overrides.description,
      project_type: "erp",
      project_method: "waterfall",
    },
    context_source: {
      context_source_id: "c1",
      kind: "document",
      title: "Kickoff.docx",
      privacy_class: overrides.privacy_class ?? 2,
      content_excerpt:
        overrides.excerpt ??
        "Das Projekt startet im Q3. Ein Go-Live-Termin fehlt im Dokument.",
      language: "de",
    },
  }
}

describe("classifyClarifyingQuestionsAutoContext (PROJ-135, AC-135.2)", () => {
  it("keeps a clean Class-2 kickoff at Class 2 (cloud-capable)", () => {
    expect(classifyClarifyingQuestionsAutoContext(ctx())).toBe(2)
  })

  it("honours the privacy_class floor — a stamped Class-3 source never drops", () => {
    expect(classifyClarifyingQuestionsAutoContext(ctx({ privacy_class: 3 }))).toBe(3)
  })

  it("upgrades to Class 3 on PII markers in the excerpt (post-PROJ-86 detection)", () => {
    expect(
      classifyClarifyingQuestionsAutoContext(
        ctx({ excerpt: "Rückfragen an max.mustermann@acme.example bitte." }),
      ),
    ).toBe(3)
  })

  it("upgrades to Class 3 on PII markers in the Vorhaben (PROJ-91 defense-in-depth)", () => {
    expect(
      classifyClarifyingQuestionsAutoContext(
        ctx({ description: "Ansprechpartner: anna.berger@acme.example" }),
      ),
    ).toBe(3)
  })

  it("does not over-trigger on plain German business text (PROJ-86 regression guard)", () => {
    expect(
      classifyClarifyingQuestionsAutoContext(
        ctx({
          excerpt:
            "Lead Scoring und Vertriebsprozesse werden im neuen System abgebildet. Die Schnittstellen zur Finanzbuchhaltung sind zu klären.",
        }),
      ),
    ).toBe(2)
  })

  it("respects a tenant default_class=3 only as a floor (mirror narrative semantics)", () => {
    // A clean Class-1 source with tenantDefault 3 returns its own (low) class
    // per the established floor logic — the resolver applies the Class-3 clamp.
    expect(classifyClarifyingQuestionsAutoContext(ctx({ privacy_class: 1 }), 3)).toBe(1)
  })
})
