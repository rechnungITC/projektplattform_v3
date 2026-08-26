/**
 * CLI for the token-drift guard. See `analyze.ts` for what it guards and why.
 *
 *   npm run check:token-drift            → check (exit 1 on new debt)
 *   npm run check:token-drift -- --write → refresh the baseline AFTER an improvement
 *
 * There is deliberately no "accept everything" mode. The initial baseline was generated once and
 * committed; from here on `--write` can only lower numbers and drop stale entries. Raising requires
 * editing `baseline.json` by hand, which shows up in the diff and has to be justified in review.
 */

import fs from "node:fs"
import path from "node:path"

import {
  analyzeTokenDrift,
  countDirectColors,
  nextBaseline,
  type Baseline,
  type MeasuredFile,
} from "./analyze"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "src")
const BASELINE = path.join(ROOT, "scripts", "check-token-drift", "baseline.json")
const EXTENSIONS = new Set([".ts", ".tsx"])

function measure(): MeasuredFile[] {
  const files: MeasuredFile[] = []
  for (const entry of fs.readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!EXTENSIONS.has(path.extname(entry.name))) continue
    const abs = path.join(entry.parentPath, entry.name)
    const rel = path.relative(ROOT, abs).split(path.sep).join("/")
    const hits = countDirectColors(fs.readFileSync(abs, "utf8"))
    if (hits > 0) files.push({ path: rel, hits })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function main(): number {
  if (!fs.existsSync(BASELINE)) {
    process.stderr.write(`token-drift: ${BASELINE} not found.\n`)
    return 2
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")) as Baseline
  const measured = measure()
  const write = process.argv.includes("--write")

  const { errors, warnings, recorded, totalHits, debtHits, stale } = analyzeTokenDrift(
    measured,
    baseline,
  )

  if (write) {
    const { baseline: next, refusals } = nextBaseline(measured, baseline)
    if (refusals.length > 0) {
      for (const r of refusals) {
        process.stderr.write(`::error::token-drift: refusing to raise ${r}\n`)
      }
      process.stderr.write(
        "token-drift: --write only lowers. Fix the new hits, or raise the number in " +
          "baseline.json by hand and justify it in the PR.\n",
      )
      return 1
    }
    const permanentCount = Object.keys(next.permanent).length
    const debtCount = Object.keys(next.debt).length
    fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`)
    process.stdout.write(
      `token-drift: baseline refreshed — ${permanentCount} permanent exception(s), ` +
        `${debtCount} file(s) with debt, ${stale.length} stale entr(y|ies) dropped.\n`,
    )
    return 0
  }

  for (const w of warnings) {
    process.stdout.write(`::warning::${w}\n`)
  }
  for (const e of errors) {
    process.stderr.write(`::error::${e}\n`)
  }

  process.stdout.write(
    `\ntoken-drift: scanned src/ — ${measured.length} file(s) carry direct Tailwind palette ` +
      `colors (${totalHits} hit(s)), ${recorded} recorded, ${debtHits} hit(s) counted as debt, ` +
      `${errors.length} error(s), ${warnings.length} warning(s).\n`,
  )

  if (errors.length > 0) {
    process.stderr.write(
      "token-drift: FAILED — new direct-color usage. Use the semantic tokens from " +
        "src/app/globals.css. Background and the exception rules: " +
        "docs/design/token-drift-guard.md\n",
    )
    return 1
  }
  process.stdout.write("token-drift: OK.\n")
  return 0
}

process.exit(main())
