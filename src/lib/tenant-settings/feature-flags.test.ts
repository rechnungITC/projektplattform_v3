import { describe, expect, it } from "vitest"

import { isMethodAwareRoutesEnabled } from "./feature-flags"

describe("isMethodAwareRoutesEnabled", () => {
  it("preserves deployed behavior when feature_flags is missing or malformed", () => {
    expect(isMethodAwareRoutesEnabled(undefined)).toBe(true)
    expect(isMethodAwareRoutesEnabled(null)).toBe(true)
    expect(isMethodAwareRoutesEnabled([])).toBe(true)
    expect(isMethodAwareRoutesEnabled("false")).toBe(true)
  })

  it("only disables method-aware routes on explicit boolean false", () => {
    expect(
      isMethodAwareRoutesEnabled({ method_aware_routes: false }),
    ).toBe(false)
    expect(isMethodAwareRoutesEnabled({ method_aware_routes: true })).toBe(true)
    expect(
      isMethodAwareRoutesEnabled({ method_aware_routes: "false" }),
    ).toBe(true)
  })
})
