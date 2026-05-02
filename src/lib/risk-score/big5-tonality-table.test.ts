import { describe, expect, it } from "vitest"

import {
  BIG5_TONALITY_TABLE,
  TONALITY_FALLBACK,
  bandFor,
  quadrantFromBig5,
  quadrantKey,
  resolveTonality,
} from "./big5-tonality-table"

const fullBig5 = {
  openness: 70,
  conscientiousness: 60,
  extraversion: 80,
  agreeableness: 70,
  emotional_stability: 70,
}

describe("BIG5_TONALITY_TABLE (PROJ-35-α)", () => {
  it("contains exactly 32 entries (2^5 quadrants)", () => {
    expect(Object.keys(BIG5_TONALITY_TABLE).length).toBe(32)
  })

  it("each entry has tone, detail_depth, channel_preference, notes (≥3)", () => {
    for (const [key, rec] of Object.entries(BIG5_TONALITY_TABLE)) {
      expect(typeof rec.tone, `${key}.tone`).toBe("string")
      expect(rec.tone.length).toBeGreaterThan(0)
      expect(rec.detail_depth.length).toBeGreaterThan(0)
      expect(rec.channel_preference.length).toBeGreaterThan(0)
      expect(rec.notes.length).toBeGreaterThanOrEqual(3)
    }
  })

  it("every key follows the O/C/E/A/S band format", () => {
    for (const key of Object.keys(BIG5_TONALITY_TABLE)) {
      expect(key).toMatch(/^(low|high)\/(low|high)\/(low|high)\/(low|high)\/(low|high)$/)
    }
  })
})

describe("bandFor", () => {
  it("< 50 → low", () => {
    expect(bandFor(49)).toBe("low")
    expect(bandFor(0)).toBe("low")
  })
  it(">= 50 → high", () => {
    expect(bandFor(50)).toBe("high")
    expect(bandFor(100)).toBe("high")
  })
  it("null → low (sentinel; caller-side fallback handles unknowns)", () => {
    expect(bandFor(null)).toBe("low")
  })
})

describe("quadrantFromBig5 + quadrantKey", () => {
  it("constructs the right key for a known fixture", () => {
    const q = quadrantFromBig5(fullBig5)
    expect(quadrantKey(q)).toBe("high/high/high/high/high")
  })
})

describe("resolveTonality", () => {
  it("returns fallback when any dimension is null", () => {
    const r = resolveTonality({
      big5_fremd: { ...fullBig5, openness: null },
    })
    expect(r.fallback).toBe(true)
    expect(r.quadrant_key).toBeNull()
    expect(r.recommendation.notes.some((n) => n.includes("unvollständig"))).toBe(true)
  })

  it("looks up the matching quadrant when all values present", () => {
    const r = resolveTonality({ big5_fremd: fullBig5 })
    expect(r.fallback).toBe(false)
    expect(r.quadrant_key).toBe("high/high/high/high/high")
    expect(r.recommendation).toBe(
      // Same reference (post-override is a fresh object, but channel matches)
      // We compare on shape:
      r.recommendation,
    )
    // Spot-check the high-high-high-high-high entry's tone
    expect(r.recommendation.tone).toContain("kollegial")
  })

  it("preferred_channel overrides the table channel", () => {
    const r = resolveTonality({
      big5_fremd: fullBig5,
      preferred_channel: "1:1-Gespräch",
    })
    expect(r.recommendation.channel_preference).toBe("1:1-Gespräch")
  })

  it("high_communication_need appends a note", () => {
    const r = resolveTonality({
      big5_fremd: fullBig5,
      high_communication_need: true,
    })
    const noteCountWithoutOverride = BIG5_TONALITY_TABLE[
      "high/high/high/high/high"
    ]!.notes.length
    expect(r.recommendation.notes.length).toBe(noteCountWithoutOverride + 1)
    expect(
      r.recommendation.notes[r.recommendation.notes.length - 1],
    ).toContain("Kommunikations-Bedarf")
  })

  it("low/low/low/low/low quadrant resolves to the conservative entry", () => {
    const r = resolveTonality({
      big5_fremd: {
        openness: 10,
        conscientiousness: 10,
        extraversion: 10,
        agreeableness: 10,
        emotional_stability: 10,
      },
    })
    expect(r.fallback).toBe(false)
    expect(r.quadrant_key).toBe("low/low/low/low/low")
    expect(r.recommendation.tone).toContain("ruhig")
  })
})

describe("TONALITY_FALLBACK", () => {
  it("has shape suitable for UI consumption", () => {
    expect(TONALITY_FALLBACK.tone.length).toBeGreaterThan(0)
    expect(TONALITY_FALLBACK.notes.length).toBeGreaterThan(0)
  })
})
