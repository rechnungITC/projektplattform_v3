/**
 * PROJ-51-β.2 — WCAG 2.1 contrast helpers for Tenant-Branding.
 *
 * Tenants supply a single brand-color hex via `tenants.branding.primary_hex`.
 * The platform must auto-pick a foreground (black or white) that satisfies
 * WCAG 1.4.3 (≥ 4.5:1 for body text). We never trust the tenant to know
 * which foreground works.
 *
 * Out of scope: APCA (perceptual contrast). Covered as a β.2-fallback if
 * pilot tenants report banding artifacts on mid-luminance brand hues.
 */

/**
 * Parse `#RRGGBB` (case-insensitive, leading-`#` optional) into integer
 * 0–255 RGB triplet. Returns `null` for invalid input — the caller should
 * fall back to the platform default (`--primary`).
 */
export function parseHex(input: string | null | undefined): {
  r: number
  g: number
  b: number
} | null {
  if (!input) return null
  const trimmed = input.trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return null
  const r = Number.parseInt(trimmed.slice(0, 2), 16)
  const g = Number.parseInt(trimmed.slice(2, 4), 16)
  const b = Number.parseInt(trimmed.slice(4, 6), 16)
  return { r, g, b }
}

/**
 * Convert a 0–255 sRGB channel value to its linearized form per WCAG 2.1
 * (4.1.4.6 Relative Luminance). The piecewise function:
 *   c < 0.03928  → c / 12.92
 *   else         → ((c + 0.055) / 1.055) ^ 2.4
 */
function linearize(channel: number): number {
  const c = channel / 255
  return c < 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * Relative luminance per WCAG 2.1.
 *   L = 0.2126 R + 0.7152 G + 0.0722 B
 * Where R/G/B are the linearized channels.
 */
export function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  )
}

/**
 * WCAG contrast ratio between two relative-luminance values:
 *   (Lmax + 0.05) / (Lmin + 0.05)
 */
export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Foreground color the auto-picker may return. */
export type BrandForeground = "white" | "black"

/**
 * Pick the foreground (black or white) that gives the best WCAG contrast
 * against the supplied brand color. Falls back to `"white"` for invalid
 * input (better default for our Dark-Teal theme — most accidents would
 * dump dark grey/black brand colors that need white text anyway).
 *
 * Used by Server-Component injection in `app/layout.tsx` to set
 * `--brand-accent-foreground`. Result:
 *   white → `0 0% 100%` HSL
 *   black → `0 0% 0%` HSL
 */
export function pickBrandForeground(brandHex: string | null | undefined): BrandForeground {
  const rgb = parseHex(brandHex)
  if (!rgb) return "white"
  const lBrand = relativeLuminance(rgb)
  const lWhite = 1
  const lBlack = 0
  const onWhite = contrastRatio(lBrand, lWhite)
  const onBlack = contrastRatio(lBrand, lBlack)
  // Pick the foreground that gives BETTER contrast. Tie → white (consistent
  // with the dark theme’s default-on-primary expectation).
  return onBlack > onWhite ? "black" : "white"
}

/** HSL triplet string (e.g. `"183 32% 73%"`) — matches `globals.css` style. */
export type HslTriplet = string

/**
 * Convert `#RRGGBB` to an HSL triplet string suitable for Tailwind's
 * `hsl(var(--…))` consumption. We render `H S% L%` (no commas, no
 * `hsl(...)` wrapper) so it can be substituted directly into a custom
 * property declaration:
 *
 *   <style>:root{--brand-accent: 183 32% 73%}</style>
 *
 * Returns `null` for invalid hex input.
 */
export function hexToHslTriplet(hex: string | null | undefined): HslTriplet | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  const hh = Math.round(h * 360)
  const ss = Math.round(s * 100)
  const ll = Math.round(l * 100)
  return `${hh} ${ss}% ${ll}%`
}

/**
 * Build the CSS-Variable assignment block injected by the layout's
 * Server Component. Returns an empty string when the brand hex is invalid
 * (caller should not emit `<style>`).
 *
 *   buildBrandStyleBlock("#a1cfd1")
 *   → ":root{--brand-accent:183 32% 73%;--brand-accent-foreground:0 0% 0%;--brand-nav-active:183 32% 73%}"
 */
export function buildBrandStyleBlock(brandHex: string | null | undefined): string {
  const triplet = hexToHslTriplet(brandHex)
  if (!triplet) return ""
  const fg = pickBrandForeground(brandHex)
  const fgTriplet = fg === "white" ? "0 0% 100%" : "0 0% 0%"
  return `:root{--brand-accent:${triplet};--brand-accent-foreground:${fgTriplet};--brand-nav-active:${triplet}}`
}
