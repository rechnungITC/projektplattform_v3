import { describe, expect, it } from "vitest"

import { __parseInlineOverrideForTest as parse } from "./tagessatz-combobox"

// PROJ-54-β AC-21 — parser unit tests for the inline-override input.
// Covers the seven shapes the user types in practice plus the rejects.

describe("parseInlineOverride", () => {
  it("parses a plain integer with no currency as EUR (default)", () => {
    expect(parse("1500")).toEqual({ daily_rate: 1500, currency: "EUR" })
  })

  it("accepts a comma decimal separator (German locale)", () => {
    expect(parse("1500,50")).toEqual({ daily_rate: 1500.5, currency: "EUR" })
  })

  it("accepts a dot decimal separator", () => {
    expect(parse("1500.50")).toEqual({ daily_rate: 1500.5, currency: "EUR" })
  })

  it("recognises the € symbol", () => {
    expect(parse("1500 €")).toEqual({ daily_rate: 1500, currency: "EUR" })
  })

  it("recognises the $ symbol as USD", () => {
    expect(parse("1200 $")).toEqual({ daily_rate: 1200, currency: "USD" })
  })

  it("recognises ISO codes case-insensitively", () => {
    expect(parse("950 chf")).toEqual({ daily_rate: 950, currency: "CHF" })
    expect(parse("950 GBP")).toEqual({ daily_rate: 950, currency: "GBP" })
  })

  it("rejects negative amounts", () => {
    expect(parse("-100 EUR")).toBeNull()
  })

  it("rejects zero", () => {
    expect(parse("0 EUR")).toBeNull()
  })

  it("rejects unsupported currency codes", () => {
    expect(parse("1500 BTC")).toBeNull()
  })

  it("rejects free-form text", () => {
    expect(parse("zwei tausend")).toBeNull()
  })

  it("rejects empty input", () => {
    expect(parse("")).toBeNull()
  })

  it("trims surrounding whitespace", () => {
    expect(parse("  900 EUR  ")).toEqual({ daily_rate: 900, currency: "EUR" })
  })
})
