import { describe, expect, it } from "vitest"

import {
  DARK_BRAND_FOREGROUND,
  LIGHT_BRAND_FOREGROUND,
  contrastRatio,
  formatContrastRatio,
  hexToRgb,
  isHexColor,
  normalizeHexColor,
  readableForeground,
} from "./brand-colors"

describe("brand-colors", () => {
  it("validates #RRGGBB colors", () => {
    expect(isHexColor("#2563EB")).toBe(true)
    expect(isHexColor("#ffffff")).toBe(true)
    expect(isHexColor("2563EB")).toBe(false)
    expect(isHexColor("#2563E")).toBe(false)
    expect(isHexColor("#2563EB00")).toBe(false)
  })

  it("normalizes trimmed valid colors and rejects invalid input", () => {
    expect(normalizeHexColor("  #2563EB  ")).toBe("#2563EB")
    expect(normalizeHexColor("")).toBeNull()
    expect(normalizeHexColor(null)).toBeNull()
    expect(normalizeHexColor("#xyzxyz")).toBeNull()
  })

  it("converts hex colors to rgb channels", () => {
    expect(hexToRgb("#2563EB")).toEqual({ r: 37, g: 99, b: 235 })
  })

  it("selects the higher-contrast foreground for dark and light colors", () => {
    expect(readableForeground("#111827")).toBe(LIGHT_BRAND_FOREGROUND)
    expect(readableForeground("#ffffff")).toBe(DARK_BRAND_FOREGROUND)
  })

  it("formats contrast ratios with German decimal commas", () => {
    expect(formatContrastRatio(4.567)).toBe("4,6")
  })

  it("keeps the default blue brand foreground above normal text contrast", () => {
    const foreground = readableForeground("#2563EB")
    expect(contrastRatio(foreground, "#2563EB")).toBeGreaterThanOrEqual(4.5)
  })
})
