import { describe, expect, it } from "vitest"

import { deriveTrafficLight } from "./traffic-light"

describe("deriveTrafficLight", () => {
  it("returns green when planned is zero (no benchmark)", () => {
    expect(deriveTrafficLight(0, 0)).toBe("green")
    expect(deriveTrafficLight(0, 100)).toBe("green")
  })

  it("returns green when actual is well below planned", () => {
    expect(deriveTrafficLight(1000, 0)).toBe("green")
    expect(deriveTrafficLight(1000, 500)).toBe("green")
    expect(deriveTrafficLight(1000, 899.99)).toBe("green")
  })

  it("returns yellow at 90% to 100%", () => {
    expect(deriveTrafficLight(1000, 900)).toBe("yellow")
    expect(deriveTrafficLight(1000, 950)).toBe("yellow")
    expect(deriveTrafficLight(1000, 1000)).toBe("yellow")
  })

  it("returns red when over 100%", () => {
    expect(deriveTrafficLight(1000, 1000.01)).toBe("red")
    expect(deriveTrafficLight(1000, 1500)).toBe("red")
  })

  it("handles negative planned amounts gracefully (treated as zero)", () => {
    expect(deriveTrafficLight(-100, 50)).toBe("green")
  })

  it("handles negative actual amounts (over-reversal scenario)", () => {
    // Negative actual → ratio negative → < 0.9 → green
    expect(deriveTrafficLight(1000, -100)).toBe("green")
  })
})
