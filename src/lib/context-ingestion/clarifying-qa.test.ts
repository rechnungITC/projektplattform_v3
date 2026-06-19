/**
 * PROJ-135 — tests for the clarifying Q&A persistence helpers, esp. the
 * 8000-char truncation rule (CIA Auflage 5): the Q&A block is always kept in
 * full; the original excerpt is head-truncated to fit.
 */
import { describe, expect, it } from "vitest"

import {
  appendWithinCap,
  CONTENT_EXCERPT_MAX,
  readClarifyingAnswers,
  renderQaBlock,
} from "./clarifying-qa"

describe("readClarifyingAnswers (PROJ-135 AC-135.4)", () => {
  it("returns [] when no clarifying block is present", () => {
    expect(readClarifyingAnswers({})).toEqual([])
    expect(readClarifyingAnswers({ clarifying: null })).toEqual([])
    expect(readClarifyingAnswers({ clarifying: { answers: "nope" } })).toEqual([])
  })

  it("keeps only answered (non-empty) Q&A and trims", () => {
    const out = readClarifyingAnswers({
      clarifying: {
        answers: [
          { question: " Go-Live? ", answer: " Q4 2026 ", gap_tag: "schedule" },
          { question: "Budget?", answer: "" }, // skipped → dropped
          { question: "", answer: "x" }, // no question → dropped
          { question: "Zielsystem?", answer: "SAP S/4HANA" },
        ],
      },
    })
    expect(out).toEqual([
      { question: "Go-Live?", answer: "Q4 2026", gap_tag: "schedule" },
      { question: "Zielsystem?", answer: "SAP S/4HANA", gap_tag: null },
    ])
  })
})

describe("renderQaBlock", () => {
  it("renders a stable numbered block with optional gap tags", () => {
    const block = renderQaBlock([
      { question: "Go-Live?", answer: "Q4", gap_tag: "schedule" },
      { question: "Budget?", answer: "500k", gap_tag: null },
    ])
    expect(block).toContain("F1 [schedule]: Go-Live?")
    expect(block).toContain("A1: Q4")
    expect(block).toContain("F2: Budget?")
    expect(block).toContain("A2: 500k")
  })
})

describe("appendWithinCap (PROJ-135 AC-135.4 / CIA Auflage 5)", () => {
  it("appends the Q&A block after the excerpt when it fits", () => {
    const out = appendWithinCap("Original excerpt.", renderQaBlock([
      { question: "Go-Live?", answer: "Q4" },
    ]))
    expect(out.startsWith("Original excerpt.")).toBe(true)
    expect(out).toContain("F1: Go-Live?")
    expect(out.length).toBeLessThanOrEqual(CONTENT_EXCERPT_MAX)
  })

  it("never exceeds the 8000-char cap and KEEPS the full Q&A block", () => {
    const hugeExcerpt = "x".repeat(9000)
    const qa = renderQaBlock([
      { question: "Go-Live-Termin?", answer: "Bitte Q4 2026 bestätigen." },
    ])
    const out = appendWithinCap(hugeExcerpt, qa)
    expect(out.length).toBeLessThanOrEqual(CONTENT_EXCERPT_MAX)
    // The Q&A block (high-value) survives in full; the excerpt was truncated.
    expect(out).toContain("F1: Go-Live-Termin?")
    expect(out).toContain("A1: Bitte Q4 2026 bestätigen.")
    expect(out).toContain("[…Excerpt gekürzt…]")
  })

  it("handles a pathological Q&A block larger than the whole cap", () => {
    const qa = "Q".repeat(CONTENT_EXCERPT_MAX + 500)
    const out = appendWithinCap("small", qa)
    expect(out.length).toBeLessThanOrEqual(CONTENT_EXCERPT_MAX)
  })
})
