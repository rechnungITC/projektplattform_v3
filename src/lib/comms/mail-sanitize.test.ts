import { describe, expect, it } from "vitest"

import { sanitizeMailTitle } from "./mail-sanitize"

describe("sanitizeMailTitle (PROJ-33-δ O2 shared util)", () => {
  it("strips email addresses", () => {
    expect(sanitizeMailTitle("Mail an alice@example.com — ok")).toBe(
      "Mail an […] — ok",
    )
  })

  it("strips phone numbers", () => {
    expect(sanitizeMailTitle("Anruf 089 1234 5678 — ok")).toBe(
      "Anruf […] — ok",
    )
  })

  it("returns null for empty input", () => {
    expect(sanitizeMailTitle("")).toBeNull()
    expect(sanitizeMailTitle("   ")).toBeNull()
  })

  it("returns null for too-long input (>default 200 chars)", () => {
    expect(sanitizeMailTitle("x".repeat(201))).toBeNull()
  })

  it("respects custom maxLen option", () => {
    expect(sanitizeMailTitle("x".repeat(40), { maxLen: 32 })).toBeNull()
    expect(sanitizeMailTitle("x".repeat(32), { maxLen: 32 })).toBe(
      "x".repeat(32),
    )
  })

  it("preserves benign titles unchanged", () => {
    expect(sanitizeMailTitle("Self-Assessment für Max")).toBe(
      "Self-Assessment für Max",
    )
  })
})
