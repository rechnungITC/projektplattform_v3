import { describe, expect, it } from "vitest"

import { classifyContextSourcePrivacy } from "./classify-privacy"

describe("classifyContextSourcePrivacy (PROJ-44-γ)", () => {
  it("returns class 1 for neutral copy", () => {
    const result = classifyContextSourcePrivacy({
      title: "Meeting minutes",
      content_excerpt: "Discussed roadmap quarters and team capacity.",
    })
    expect(result.privacy_class).toBe(1)
    expect(result.matched_patterns).toEqual([])
  })

  it("flags class 3 when the content contains an email", () => {
    const result = classifyContextSourcePrivacy({
      title: "Customer escalation",
      content_excerpt: "alice@example.com asked about delivery slip.",
    })
    expect(result.privacy_class).toBe(3)
    expect(result.matched_patterns.length).toBeGreaterThan(0)
  })

  it("flags class 3 when the content contains a phone number", () => {
    const result = classifyContextSourcePrivacy({
      title: "Voicemail transcript",
      content_excerpt: "Call back +49 30 1234567",
    })
    expect(result.privacy_class).toBe(3)
  })

  it("flags class 3 when the content contains an IBAN", () => {
    const result = classifyContextSourcePrivacy({
      title: "Vendor invoice",
      content_excerpt: "Please transfer to DE89 3704 0044 0532 0130 00.",
    })
    expect(result.privacy_class).toBe(3)
  })

  it("flags class 2 for confidential business content with no PII", () => {
    const result = classifyContextSourcePrivacy({
      title: "Vertrauliches Steering-Brief",
      content_excerpt: "Budget 250.000 EUR · Status amber · PROJ-1 affected.",
    })
    expect(result.privacy_class).toBe(2)
  })

  it("upgrades to class 3 when both class-2 and class-3 signals are present", () => {
    const result = classifyContextSourcePrivacy({
      title: "Stakeholder mail",
      content_excerpt: "alice@example.com · 200.000 EUR Budget · vertraulich",
    })
    expect(result.privacy_class).toBe(3)
  })
})
