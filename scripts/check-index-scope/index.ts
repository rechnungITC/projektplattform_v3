/**
 * CLI wrapper for the Deployment-Scope guard. See ./analyze.ts for the rules and why they exist.
 *
 * Pure file analysis — no DB, no network, no secrets. Safe as a required check.
 */
import fs from "node:fs"
import path from "node:path"

import { analyzeIndex } from "./analyze"

const INDEX = path.join(process.cwd(), "features", "INDEX.md")

function main(): number {
  if (!fs.existsSync(INDEX)) {
    process.stderr.write(`index-scope: ${INDEX} not found.\n`)
    return 2
  }

  const { errors, warnings, rows, unclassified } = analyzeIndex(fs.readFileSync(INDEX, "utf8"))

  // GitHub Actions annotations (::warning / ::error) + plain text locally.
  for (const w of warnings) {
    process.stdout.write(`::warning::${w}\n`)
  }
  for (const e of errors) {
    process.stderr.write(`::error::${e}\n`)
  }

  const classified = rows.length - unclassified.length
  process.stdout.write(
    `\nindex-scope: scanned ${rows.length} feature row(s) — ` +
      `${classified} carry a scope or "—", ${unclassified.length} awaiting classification, ` +
      `${errors.length} error(s), ${warnings.length} warning(s).\n`
  )

  if (errors.length > 0) {
    process.stderr.write(
      "index-scope: FAILED — lifecycle status and deployment scope disagree, or the column is " +
        "missing. See .claude/rules/general.md (Deployment Scope).\n"
    )
    return 1
  }
  process.stdout.write("index-scope: OK.\n")
  return 0
}

process.exit(main())
