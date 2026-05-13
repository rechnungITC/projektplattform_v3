import { describe, expect, it } from "vitest"

import { aggregateInteractionSignal } from "./aggregate"

describe("aggregateInteractionSignal", () => {
  it("returns null for empty input", () => {
    expect(aggregateInteractionSignal([])).toBeNull()
  })

  it("returns null when every entry is nullish", () => {
    expect(aggregateInteractionSignal([null, undefined, null])).toBeNull()
  })

  it("computes median for an odd-sized sample", () => {
    const r = aggregateInteractionSignal([-2, 0, 2])
    expect(r).not.toBeNull()
    expect(r!.median).toBe(0)
    expect(r!.spread).toBe(4)
    expect(r!.count).toBe(3)
    expect(r!.hasSpread).toBe(true)
  })

  it("computes median for an even-sized sample (interpolates the two middles)", () => {
    const r = aggregateInteractionSignal([-1, 1])
    expect(r).not.toBeNull()
    expect(r!.median).toBe(0)
    expect(r!.spread).toBe(2)
    expect(r!.hasSpread).toBe(false)
  })

  it("flags the bimodal 2-koop+2-obstr meeting (Designer D5 motivating case)", () => {
    const r = aggregateInteractionSignal([2, 2, -2, -2])
    expect(r).not.toBeNull()
    expect(r!.median).toBe(0)
    expect(r!.spread).toBe(4)
    expect(r!.hasSpread).toBe(true)
  })

  it("filters out null entries before computing", () => {
    const r = aggregateInteractionSignal([1, null, 2, undefined, 1])
    expect(r).not.toBeNull()
    expect(r!.count).toBe(3)
    expect(r!.median).toBe(1)
    expect(r!.spread).toBe(1)
    expect(r!.hasSpread).toBe(false)
  })

  it("hasSpread is false at exactly spread=2", () => {
    expect(
      aggregateInteractionSignal([0, 2])!.hasSpread,
    ).toBe(false)
  })
})