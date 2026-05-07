/**
 * PROJ-51-β.2 — Tests for the WCAG contrast helpers + brand-style-block
 * builder. Covers parsing, luminance computation, foreground picking, and
 * the inline `<style>` payload that the layout injects.
 */

import { describe, expect, it } from "vitest"

import {
  buildBrandStyleBlock,
  contrastRatio,
  hexToHslTriplet,
  parseHex,
  pickBrandForeground,
  relativeLuminance,
} from "./contrast"

describe("parseHex", () => {
  it("parses uppercase hex with leading #", () => {
    expect(parseHex("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 })
  })
  it("parses lowercase hex without leading #", () => {
    expect(parseHex("a1cfd1")).toEqual({ r: 161, g: 207, b: 209 })
  })
  it("rejects 3-digit shorthand", () => {
    expect(parseHex("#abc")).toBeNull()
  })
  it("rejects invalid characters", () => {
    expect(parseHex("#zzzzzz")).toBeNull()
  })
  it("returns null on null/undefined/empty", () => {
    expect(parseHex(null)).toBeNull()
    expect(parseHex(undefined)).toBeNull()
    expect(parseHex("")).toBeNull()
  })
})

describe("relativeLuminance", () => {
  it("returns 1 for pure white", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
  })
  it("returns 0 for pure black", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
  })
  it("returns ~0.215 for sRGB primary green", () => {
    expect(relativeLuminance({ r: 0, g: 255, b: 0 })).toBeCloseTo(0.7152, 3)
  })
})

describe("contrastRatio", () => {
  it("returns 21 for white on black (max possible)", () => {
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 5)
  })
  it("returns 1 for identical luminance", () => {
    expect(contrastRatio(0.5, 0.5)).toBe(1)
  })
})

describe("pickBrandForeground", () => {
  it("returns 'black' for the platform Dark-Teal primary (#a1cfd1, light)", () => {
    expect(pickBrandForeground("#a1cfd1")).toBe("black")
  })
  it("returns 'white' for a saturated dark blue (#0b1326)", () => {
    expect(pickBrandForeground("#0b1326")).toBe("white")
  })
  it("returns 'white' for null input (safe default)", () => {
    expect(pickBrandForeground(null)).toBe("white")
  })
  it("returns 'black' for pure yellow (high luminance)", () => {
    expect(pickBrandForeground("#ffff00")).toBe("black")
  })
})

describe("hexToHslTriplet", () => {
  it("converts the platform primary teal correctly", () => {
    // #a1cfd1 → roughly hsl(183, 32%, 73%) — allow ±1 rounding tolerance
    const t = hexToHslTriplet("#a1cfd1")
    expect(t).not.toBeNull()
    const m = /^(\d+) (\d+)% (\d+)%$/.exec(t!)
    expect(m).not.toBeNull()
    const [, h, s, l] = m!
    expect(Number(h)).toBeGreaterThanOrEqual(180)
    expect(Number(h)).toBeLessThanOrEqual(186)
    expect(Number(s)).toBeGreaterThanOrEqual(28)
    expect(Number(s)).toBeLessThanOrEqual(36)
    expect(Number(l)).toBeGreaterThanOrEqual(70)
    expect(Number(l)).toBeLessThanOrEqual(76)
  })
  it("returns '0 0% 0%' for pure black (well-defined edge)", () => {
    expect(hexToHslTriplet("#000000")).toBe("0 0% 0%")
  })
  it("returns null on invalid input", () => {
    expect(hexToHslTriplet("not-a-hex")).toBeNull()
    expect(hexToHslTriplet(null)).toBeNull()
  })
})

describe("buildBrandStyleBlock", () => {
  it("emits a complete :root override for a valid brand hex", () => {
    const css = buildBrandStyleBlock("#a1cfd1")
    expect(css).toContain(":root{")
    expect(css).toContain("--brand-accent:")
    expect(css).toContain("--brand-accent-foreground:")
    expect(css).toContain("--brand-nav-active:")
    expect(css.endsWith("}")).toBe(true)
  })
  it("returns empty string on invalid input (caller suppresses <style>)", () => {
    expect(buildBrandStyleBlock(null)).toBe("")
    expect(buildBrandStyleBlock("not-a-hex")).toBe("")
  })
  it("auto-picks black foreground for the light platform teal", () => {
    expect(buildBrandStyleBlock("#a1cfd1")).toContain(
      "--brand-accent-foreground:0 0% 0%",
    )
  })
  it("auto-picks white foreground for a saturated dark brand color", () => {
    expect(buildBrandStyleBlock("#1a3d5c")).toContain(
      "--brand-accent-foreground:0 0% 100%",
    )
  })
})
