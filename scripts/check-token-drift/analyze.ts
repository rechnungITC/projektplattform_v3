/**
 * Guards the design-system token boundary: no raw Tailwind palette colors in `src/`.
 *
 * Why it exists — measured, not assumed. PROJ-51 built the token layer (β) and migrated the then
 * existing consumers (γ.5/γ.6), and it worked: right after that slice the codebase carried **76**
 * direct-color hits in **8** files. Nothing guarded the result, so it grew back:
 *
 *   2026-05-07   76 hits /  8 files   ← immediately after PROJ-51 γ.6
 *   2026-06-01  408 hits / 45 files
 *   2026-07-01  563 hits / 63 files
 *   2026-08-01  655 hits / 75 files
 *   2026-08-26  732 hits / 85 files   ← ~10x in under four months
 *
 * All five numbers come from ONE pattern (this one) applied at those revisions, so the series is
 * comparable — the earlier figure of "105 in 26 files" quoted in the PROJ-51 α audit used a
 * narrower pattern and must not be read as part of this trend.
 *
 * That trend is the whole argument for a ratchet instead of another cleanup: PROJ-51's cleanup was
 * real and it evaporated. So this guard does not demand zero. It freezes what exists, fails on
 * anything NEW, and lets the number fall.
 *
 * Deliberate boundary: Tailwind palette utilities only, not raw hex. Hex was measured separately
 * (6 files) and every occurrence is legitimate — a default value, a canvas/3D fill, an input
 * placeholder — i.e. places where a CSS variable cannot be used. Adding hex detection would need
 * its own exception list for cases that are all fine, which is cost without protection.
 *
 * Known limit, measured today: the scan reads raw file text, so a *comment* mentioning a palette
 * color would count as a violation. There are currently **0** such hits in `src/`, so no comment
 * stripping is implemented; if that ever changes, rephrase the comment or record the file.
 */

/** Tailwind's default palette families. Neutrals are included: they are only 21 of the 732 hits
 *  today, so leaving them out would buy nothing and create an arbitrary seam in the rule. */
const PALETTE_FAMILIES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
] as const

/** Utility prefixes that take a color. `shadow-`/`ring-`/`divide-` included: a colored shadow is
 *  as much a token bypass as a colored background. */
const COLOR_PREFIXES = [
  "bg", "text", "border", "ring", "from", "via", "to", "decoration", "outline",
  "divide", "placeholder", "caret", "accent", "shadow", "fill", "stroke",
] as const

/**
 * Matches e.g. `bg-emerald-600`, `text-amber-400/70`, `border-risk`… no: `risk` is not a palette
 * family, so semantic tokens (`bg-risk-low/10`, `text-success`) do NOT match. That asymmetry is
 * the point of the rule.
 */
export const DIRECT_COLOR_PATTERN = new RegExp(
  String.raw`\b(?:${COLOR_PREFIXES.join("|")})-(?:${PALETTE_FAMILIES.join("|")})-(?:50|[1-9]00|950)\b`,
  "g",
)

export function countDirectColors(source: string): number {
  // A fresh RegExp per call: a shared `g`-flagged instance carries `lastIndex` between calls and
  // would silently under-count every second file. Same trap PROJ-Y-130g pinned in a guard test.
  const pattern = new RegExp(DIRECT_COLOR_PATTERN.source, "g")
  return source.match(pattern)?.length ?? 0
}

export interface PermanentEntry {
  hits: number
  reason: string
}

export interface Baseline {
  /** Architectural decisions PROJ-51 recorded in its spec under "Bewusst nicht migriert". */
  permanent: Record<string, PermanentEntry>
  /** Everything else: debt, frozen at its current size so it can only shrink. */
  debt: Record<string, number>
}

export interface MeasuredFile {
  path: string
  hits: number
}

export interface AnalysisResult {
  errors: string[]
  warnings: string[]
  /** Files that carry hits and are recorded — i.e. the accepted state. */
  recorded: number
  /** Sum of hits over all measured files. */
  totalHits: number
  /** Sum of hits in files recorded as debt (the number that should fall over time). */
  debtHits: number
  /** Entries in the baseline that no longer match reality. */
  stale: string[]
}

/**
 * Compares a measurement against the baseline.
 *
 * Direction matters and is asymmetric on purpose:
 *   * MORE hits than recorded, or an unrecorded file → **error**. That is new debt.
 *   * FEWER hits, or a recorded file that lost its colors → **warning**. That is progress, and a
 *     guard that fails on progress teaches people to avoid the guard.
 *
 * The warning is deliberately not the primary signal (PROJ-Y-130f: a warning nobody reads prevents
 * nothing) — the defect this guard exists for is growth, and growth is a hard error. The warning
 * only says "your baseline is now stale", with the exact command to refresh it.
 */
export function analyzeTokenDrift(
  measured: MeasuredFile[],
  baseline: Baseline,
): AnalysisResult {
  const errors: string[] = []
  const warnings: string[] = []
  const stale: string[] = []
  const seen = new Set<string>()
  let recorded = 0
  let totalHits = 0
  let debtHits = 0

  for (const file of measured) {
    if (file.hits === 0) continue
    seen.add(file.path)
    totalHits += file.hits

    const permanent = baseline.permanent[file.path]
    if (permanent) {
      recorded++
      if (file.hits > permanent.hits) {
        errors.push(
          `${file.path}: ${file.hits} direct-color hits, recorded exception allows ${permanent.hits}. ` +
            `A documented exception is not a licence to add more — either the taxonomy really grew ` +
            `(then raise the number in scripts/check-token-drift/baseline.json and say why in the PR) ` +
            `or use a semantic token.`,
        )
      }
      continue
    }

    const debt = baseline.debt[file.path]
    if (debt === undefined) {
      errors.push(
        `${file.path}: ${file.hits} direct-color hit(s) in a file the baseline does not know. ` +
          `Use the semantic tokens from src/app/globals.css (bg-risk-low/10, text-success, ` +
          `text-warning, text-muted-foreground, …) instead of a raw Tailwind palette color.`,
      )
      continue
    }

    recorded++
    debtHits += file.hits
    if (file.hits > debt) {
      errors.push(
        `${file.path}: ${file.hits} direct-color hits, baseline records ${debt}. ` +
          `The debt in this file may shrink, never grow.`,
      )
    } else if (file.hits < debt) {
      warnings.push(
        `${file.path}: down to ${file.hits} from ${debt} — refresh the baseline with ` +
          `\`npm run check:token-drift -- --write\`.`,
      )
    }
  }

  for (const [path, entry] of Object.entries(baseline.permanent)) {
    if (!seen.has(path)) {
      stale.push(path)
      warnings.push(
        `${path}: recorded as a permanent exception (${entry.hits} hits) but carries none any more. ` +
          `Remove the entry — a stale exception can later hide a real finding in the same file.`,
      )
    }
  }
  for (const [path, hits] of Object.entries(baseline.debt)) {
    if (!seen.has(path)) {
      stale.push(path)
      warnings.push(
        `${path}: recorded with ${hits} hits but carries none any more (or the file is gone). ` +
          `Remove the entry.`,
      )
    }
  }

  return { errors, warnings, recorded, totalHits, debtHits, stale }
}

/**
 * Builds the baseline that `--write` would persist.
 *
 * Refuses to raise anything: if the measurement contains a new file or a higher count, the caller
 * must fail instead of writing. Without that refusal `--write` would be a one-command escape hatch
 * and the guard would be decorative — exactly the failure mode PROJ-147 found in the Snyk check.
 */
export function nextBaseline(
  measured: MeasuredFile[],
  baseline: Baseline,
): { baseline: Baseline; refusals: string[] } {
  const refusals: string[] = []
  const permanent: Record<string, PermanentEntry> = {}
  const debt: Record<string, number> = {}

  for (const file of measured) {
    if (file.hits === 0) continue
    const known = baseline.permanent[file.path]
    if (known) {
      if (file.hits > known.hits) {
        refusals.push(`${file.path}: ${known.hits} → ${file.hits}`)
        permanent[file.path] = known
      } else {
        permanent[file.path] = { hits: file.hits, reason: known.reason }
      }
      continue
    }
    const recordedDebt = baseline.debt[file.path]
    if (recordedDebt === undefined) {
      refusals.push(`${file.path}: new file with ${file.hits} hit(s)`)
      continue
    }
    debt[file.path] = Math.min(file.hits, recordedDebt)
    if (file.hits > recordedDebt) {
      refusals.push(`${file.path}: ${recordedDebt} → ${file.hits}`)
    }
  }

  return { baseline: { permanent, debt }, refusals }
}
