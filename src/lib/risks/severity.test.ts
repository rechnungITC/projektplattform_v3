import { describe, expect, it } from "vitest"

import { riskSeverityBucket, riskSeverityBadgeTone } from "./severity"

// PROJ-107 — canonical severity buckets must match DB _risk_severity_bucket.

describe("riskSeverityBucket", () => {
  it("maps score to the 4-tier DB buckets (6/12/19)", () => {
    expect(riskSeverityBucket(1)).toBe("low")
    expect(riskSeverityBucket(6)).toBe("low")
    expect(riskSeverityBucket(7)).toBe("medium")
    expect(riskSeverityBucket(12)).toBe("medium")
    expect(riskSeverityBucket(13)).toBe("high")
    expect(riskSeverityBucket(19)).toBe("high")
    expect(riskSeverityBucket(20)).toBe("critical")
    expect(riskSeverityBucket(25)).toBe("critical")
  })

  it("distinct tint per bucket", () => {
    const tones = new Set(
      [3, 9, 16, 25].map((s) => riskSeverityBadgeTone(s))
    )
    expect(tones.size).toBe(4)
  })
})
