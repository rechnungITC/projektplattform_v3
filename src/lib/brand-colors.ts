export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/

export const DARK_BRAND_FOREGROUND = "#06121f"
export const LIGHT_BRAND_FOREGROUND = "#ffffff"

export type BrandForeground =
  | typeof DARK_BRAND_FOREGROUND
  | typeof LIGHT_BRAND_FOREGROUND

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_COLOR.test(value)
}

export function normalizeHexColor(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  return isHexColor(trimmed) ? trimmed : null
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.slice(1)
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  }
}

export function channelToLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  )
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

export function readableForeground(hex: string): BrandForeground {
  const darkRatio = contrastRatio(DARK_BRAND_FOREGROUND, hex)
  const lightRatio = contrastRatio(LIGHT_BRAND_FOREGROUND, hex)
  return darkRatio >= lightRatio
    ? DARK_BRAND_FOREGROUND
    : LIGHT_BRAND_FOREGROUND
}

export function formatContrastRatio(value: number): string {
  return value.toFixed(1).replace(".", ",")
}
