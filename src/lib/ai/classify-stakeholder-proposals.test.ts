import { describe, expect, it } from "vitest"

import { classifyStakeholderProposalsAutoContext } from "./classify"
import type { StakeholderProposalsAutoContext } from "./types"

function ctx(
  overrides: Partial<StakeholderProposalsAutoContext> = {},
): StakeholderProposalsAutoContext {
  return {
    source_project: {
      project_id: "p1",
      name: "ERP Implementierung",
      description: "ERP-System auf Basis von MS Dynamics einführen.",
      project_type: "erp",
      project_method: "scrum",
      lifecycle_status: "active",
    },
    context_source: {
      context_source_id: "c1",
      kind: "document",
      title: "Kickoff.docx",
      privacy_class: 2,
      content_excerpt: "Völlig unverfängliche Projektnotiz ohne Namen.",
      language: "de",
    },
    existing_stakeholders: [],
    ...overrides,
  }
}

describe("classifyStakeholderProposalsAutoContext — PROJ-88 Class-3 pin", () => {
  it("returns 3 even for a squeaky-clean Class-1 excerpt", () => {
    const clean = ctx({
      context_source: {
        context_source_id: "c1",
        kind: "document",
        title: "Notiz",
        privacy_class: 1,
        content_excerpt: "Phasenplan Q3.",
        language: "de",
      },
    })
    expect(classifyStakeholderProposalsAutoContext(clean)).toBe(3)
  })

  it("returns 3 regardless of the tenant default", () => {
    expect(classifyStakeholderProposalsAutoContext(ctx(), 1)).toBe(3)
    expect(classifyStakeholderProposalsAutoContext(ctx(), 2)).toBe(3)
    expect(classifyStakeholderProposalsAutoContext(ctx(), 3)).toBe(3)
  })

  it("returns 3 for an empty context (no content at all)", () => {
    const empty = ctx({
      context_source: {
        context_source_id: "c1",
        kind: "other",
        title: "",
        privacy_class: 1,
        content_excerpt: "",
        language: null,
      },
      source_project: {
        project_id: "p1",
        name: "",
        description: null,
        project_type: null,
        project_method: null,
        lifecycle_status: "draft",
      },
    })
    expect(classifyStakeholderProposalsAutoContext(empty)).toBe(3)
  })
})
