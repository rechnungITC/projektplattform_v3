import { describe, expect, it } from "vitest"

import { resolveDecisionApprovalRule } from "./approval-rules"

describe("resolveDecisionApprovalRule (PROJ-31)", () => {
  it("returns no-approval when method is null", () => {
    const rule = resolveDecisionApprovalRule(null, "in_progress")
    expect(rule.requires_approval).toBe(false)
  })

  it("waterfall + in_progress phase requires approval", () => {
    const rule = resolveDecisionApprovalRule("waterfall", "in_progress")
    expect(rule.requires_approval).toBe(true)
    expect(rule.default_quorum).toBe(1)
  })

  it("waterfall + planned phase requires approval", () => {
    const rule = resolveDecisionApprovalRule("waterfall", "planned")
    expect(rule.requires_approval).toBe(true)
  })

  it("waterfall + completed phase does NOT auto-require approval", () => {
    const rule = resolveDecisionApprovalRule("waterfall", "completed")
    expect(rule.requires_approval).toBe(false)
  })

  it("scrum decisions never auto-require approval (operational)", () => {
    expect(resolveDecisionApprovalRule("scrum", "in_progress")).toEqual({
      requires_approval: false,
    })
    expect(resolveDecisionApprovalRule("scrum", "planned")).toEqual({
      requires_approval: false,
    })
  })

  it("kanban decisions never auto-require approval (operational)", () => {
    expect(
      resolveDecisionApprovalRule("kanban", "in_progress").requires_approval,
    ).toBe(false)
  })

  it("safe decisions never auto-require approval (operational)", () => {
    expect(
      resolveDecisionApprovalRule("safe", "in_progress").requires_approval,
    ).toBe(false)
  })

  it("returns no-approval when phase is null", () => {
    expect(resolveDecisionApprovalRule("waterfall", null).requires_approval)
      .toBe(false)
  })
})
