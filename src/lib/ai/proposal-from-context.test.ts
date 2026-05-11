import { describe, expect, it } from "vitest"

import { invokeProposalFromContext } from "./proposal-from-context"

const baseSource = {
  id: "src-1",
  tenant_id: "tnt-1",
  title: "Vendor escalation",
  content_excerpt: "ETA slipped by two weeks.",
}

describe("invokeProposalFromContext (PROJ-44-δ)", () => {
  it("emits work_item + open_item for email sources", async () => {
    const result = await invokeProposalFromContext({
      source: { ...baseSource, kind: "email", privacy_class: 1 },
      hasLocalProvider: false,
    })
    expect(result.blocked).toBe(false)
    expect(result.proposals.map((p) => p.kind).sort()).toEqual([
      "open_item",
      "work_item",
    ])
    expect(result.provider).toBe("stub")
  })

  it("emits decision + work_item for meeting notes", async () => {
    const result = await invokeProposalFromContext({
      source: { ...baseSource, kind: "meeting_notes", privacy_class: 2 },
      hasLocalProvider: false,
    })
    expect(result.proposals.map((p) => p.kind).sort()).toEqual([
      "decision",
      "work_item",
    ])
  })

  it("emits risk for document sources", async () => {
    const result = await invokeProposalFromContext({
      source: { ...baseSource, kind: "document", privacy_class: 1 },
      hasLocalProvider: false,
    })
    expect(result.proposals[0].kind).toBe("risk")
  })

  it("hard-blocks Class-3 inputs when no local provider is available", async () => {
    const result = await invokeProposalFromContext({
      source: { ...baseSource, kind: "email", privacy_class: 3 },
      hasLocalProvider: false,
    })
    expect(result.blocked).toBe(true)
    expect(result.proposals).toEqual([])
    expect(result.provider).toBe("blocked")
    expect(result.blocked_reason).toContain("Class-3")
  })

  it("processes Class-3 inputs when a local provider is configured", async () => {
    const result = await invokeProposalFromContext({
      source: { ...baseSource, kind: "email", privacy_class: 3 },
      hasLocalProvider: true,
    })
    expect(result.blocked).toBe(false)
    expect(result.provider).toBe("stub-local")
    expect(result.proposals.length).toBeGreaterThan(0)
  })
})
