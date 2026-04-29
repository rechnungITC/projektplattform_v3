import { describe, expect, it } from "vitest"

import { classifyRiskAutoContext } from "./classify"
import type { RiskAutoContext } from "./types"

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
