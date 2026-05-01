import { describe, expect, it } from "vitest"

import {
  classifyNarrativeAutoContext,
  classifyRiskAutoContext,
} from "./classify"
import type { NarrativeAutoContext, RiskAutoContext } from "./types"

function baseContext(): RiskAutoContext {
  return {
    project: {
      name: "ERP Rollout",
      project_type: "erp_implementation",
      project_method: "scrum",
      lifecycle_status: "active",
      planned_start_date: "2026-04-01",
      planned_end_date: "2026-12-31",
    },
    phases: [
      {
        name: "Spec",
        status: "active",
        planned_start: "2026-04-01",
        planned_end: "2026-06-30",
      },
    ],
    milestones: [
      {
        name: "Spec abgenommen",
        status: "open",
        target_date: "2026-06-30",
      },
    ],
    work_items: [
      { title: "Datenmigration vorbereiten", kind: "task", status: "todo" },
    ],
    existing_risks: [
      { title: "Schnittstellen unklar", probability: 3, impact: 4 },
    ],
  }
}

describe("classifyRiskAutoContext", () => {
  it("returns class 2 for the curated allowlist (no Class-3 fields)", () => {
    expect(classifyRiskAutoContext(baseContext())).toBe(2)
  })

  it("escalates to class 3 if a stakeholder field sneaks in", () => {
    // Simulate a future bug where the auto-context shape leaks a Class-3 field.
    const ctx = baseContext()
    ;(ctx.project as unknown as Record<string, unknown>)["responsible_user_id"] =
      "00000000-0000-0000-0000-000000000001"
    expect(classifyRiskAutoContext(ctx)).toBe(3)
  })

  it("skips empty/null/undefined values when computing class", () => {
    const ctx: RiskAutoContext = {
      project: {
        name: "P",
        project_type: null,
        project_method: null,
        lifecycle_status: "draft",
        planned_start_date: null,
        planned_end_date: null,
      },
      phases: [],
      milestones: [],
      work_items: [],
      existing_risks: [],
    }
    expect(classifyRiskAutoContext(ctx)).toBe(2) // project.name is class 2
  })

  it("returns class 1 when only enum/id fields are present", () => {
    const ctx: RiskAutoContext = {
      project: {
        name: "",
        project_type: "construction",
        project_method: "waterfall",
        lifecycle_status: "active",
        planned_start_date: null,
        planned_end_date: null,
      },
      phases: [],
      milestones: [],
      work_items: [],
      existing_risks: [],
    }
    expect(classifyRiskAutoContext(ctx)).toBe(1)
  })

  it("walks lists and uses the highest class observed", () => {
    const ctx = baseContext()
    ctx.work_items.push({
      title: "Spec review",
      kind: "task",
      status: "todo",
    })
    expect(classifyRiskAutoContext(ctx)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// PROJ-30 — narrative classifier tests (whitelist-based)
// ---------------------------------------------------------------------------

function baseNarrativeContext(): NarrativeAutoContext {
  return {
    kind: "status_report",
    project: {
      name: "ERP Rollout",
      project_type: "erp_implementation",
      project_method: "waterfall",
      lifecycle_status: "active",
      planned_start_date: "2026-04-01",
      planned_end_date: "2026-12-31",
    },
    phases_summary: { total: 0, by_status: {} },
    top_risks: [],
    top_decisions: [],
    upcoming_milestones: [],
    backlog_counts: { by_kind: {}, by_status: {} },
  }
}

describe("classifyNarrativeAutoContext", () => {
  it("returns 2 for an empty/structural context (whitelist allows all keys)", () => {
    expect(classifyNarrativeAutoContext(baseNarrativeContext(), 1)).toBe(2)
  })

  it("returns 2 for a fully populated whitelist-only context", () => {
    const ctx = baseNarrativeContext()
    ctx.phases_summary = { total: 5, by_status: { active: 2, planned: 3 } }
    ctx.top_risks = [{ title: "Datenmigration", score: 16, status: "open" }]
    ctx.top_decisions = [{ title: "Vendor X gewählt", decided_at: "2026-04-15" }]
    ctx.upcoming_milestones = [
      { name: "Cutover", status: "planned", target_date: "2026-08-01" },
    ]
    ctx.backlog_counts = {
      by_kind: { task: 12 },
      by_status: { todo: 5, done: 7 },
    }
    expect(classifyNarrativeAutoContext(ctx, 1)).toBe(2)
  })

  it("returns 3 when an un-whitelisted top-level key is present (fail-safe)", () => {
    const ctx = baseNarrativeContext() as NarrativeAutoContext & {
      responsible_user_id?: string
    }
    ctx.responsible_user_id = "00000000-0000-0000-0000-000000000abc"
    expect(classifyNarrativeAutoContext(ctx, 1)).toBe(3)
  })

  it("returns 3 when an un-whitelisted nested key is present (fail-safe)", () => {
    const ctx = baseNarrativeContext()
    ;(ctx.project as unknown as Record<string, unknown>).lead_name =
      "Anna Beispiel"
    expect(classifyNarrativeAutoContext(ctx, 1)).toBe(3)
  })

  it("returns 3 when an un-whitelisted key appears inside a list item", () => {
    const ctx = baseNarrativeContext()
    ;(ctx.top_risks as Array<Record<string, unknown>>).push({
      title: "DSGVO",
      score: 20,
      status: "open",
      responsible_user_id: "00000000-0000-0000-0000-000000000abc",
    })
    expect(classifyNarrativeAutoContext(ctx, 1)).toBe(3)
  })

  it("ignores explicit null/empty values for whitelist check", () => {
    const ctx = baseNarrativeContext()
    ctx.project.planned_start_date = null
    ctx.project.planned_end_date = null
    expect(classifyNarrativeAutoContext(ctx, 1)).toBe(2)
  })

  it("safely handles tenantDefault=3 with a populated whitelist context", () => {
    expect(classifyNarrativeAutoContext(baseNarrativeContext(), 3)).toBe(2)
  })
})
