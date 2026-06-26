import { describe, expect, it } from "vitest"

import {
  MA_PHASE_COUNT,
  MA_PHASE_PRESET,
  MANDATE_GATED_PHASE_SEQUENCE,
} from "./ma-phase-preset"

// PROJ-95 — guards the M&A phase preset. Names + sequence must stay in sync
// with the seed RPC activate_ma_phase_model (the SQL VALUES list mirrors this).
describe("PROJ-95 M&A phase preset", () => {
  it("defines exactly ten phases", () => {
    expect(MA_PHASE_PRESET).toHaveLength(10)
    expect(MA_PHASE_COUNT).toBe(10)
  })

  it("is sequenced 1..10 without gaps", () => {
    expect(MA_PHASE_PRESET.map((p) => p.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
  })

  it("gates exactly one phase (Phase 2, Target-Screening) on the mandate", () => {
    const gated = MA_PHASE_PRESET.filter((p) => p.mandateGated)
    expect(gated).toHaveLength(1)
    expect(gated[0]?.sequence).toBe(MANDATE_GATED_PHASE_SEQUENCE)
    expect(gated[0]?.name_de).toContain("Target-Screening")
  })

  it("has unique keys and non-empty German names + descriptions", () => {
    const keys = new Set(MA_PHASE_PRESET.map((p) => p.key))
    expect(keys.size).toBe(MA_PHASE_PRESET.length)
    for (const p of MA_PHASE_PRESET) {
      expect(p.name_de.length).toBeGreaterThan(0)
      expect(p.description_de.length).toBeGreaterThan(0)
    }
  })

  it("starts at Strategie and ends at Post-Merger-Integration", () => {
    expect(MA_PHASE_PRESET[0]?.name_de).toContain("Strategie")
    expect(MA_PHASE_PRESET.at(-1)?.name_de).toContain("Post-Merger-Integration")
  })
})
