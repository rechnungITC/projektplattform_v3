/**
 * PROJ-100a — need-to-know confidentiality levels (M&A Release 0).
 *
 * Ordered: standard < confidential < strict. Orthogonal to Class-3
 * (privacy_class) — this is the M&A need-to-know axis, NOT the data-privacy
 * axis (ma-domain-architecture ADR Fork 3). Mirrors the
 * `public.ma_confidentiality_level` Postgres enum.
 */

export type MaConfidentialityLevel = "standard" | "confidential" | "strict"

export const MA_CONFIDENTIALITY_LEVELS: readonly MaConfidentialityLevel[] = [
  "standard",
  "confidential",
  "strict",
] as const

export const MA_CONFIDENTIALITY_LEVEL_LABELS: Record<
  MaConfidentialityLevel,
  string
> = {
  standard: "Standard",
  confidential: "Vertraulich",
  strict: "Streng vertraulich",
}
