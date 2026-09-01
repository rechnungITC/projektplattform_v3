/**
 * CLI wrapper for the Register-Consistency guard. See ./analyze.ts for the rules, the
 * measurements behind them, and what is deliberately not checked.
 *
 * Pure file analysis — no DB, no network, no secrets. Safe as a required check.
 */
import fs from "node:fs"
import path from "node:path"

import { analyzeRegister } from "./analyze"

const REGISTER = path.join(process.cwd(), "features", "OPEN-DEFERRED-STATUS.md")
const INDEX = path.join(process.cwd(), "features", "INDEX.md")

function main(): number {
  for (const file of [REGISTER, INDEX]) {
    if (!fs.existsSync(file)) {
      process.stderr.write(`register-consistency: ${file} not found.\n`)
      return 2
    }
  }

  const { errors, warnings, tableRows, sections, claims, comparedIds } = analyzeRegister(
    fs.readFileSync(REGISTER, "utf8"),
    fs.readFileSync(INDEX, "utf8")
  )

  // A register with no narrative sections at all would make R1 vacuous. Say so rather than
  // reporting a silent pass — an empty check that prints "OK" is how a guard rots unnoticed.
  if (sections.length === 0) {
    process.stdout.write(
      "::warning::register-consistency: no narrative `## PROJ-<n> — …` sections found. " +
        "Either the file changed shape or the parser no longer matches it.\n"
    )
  }

  for (const w of warnings) {
    process.stdout.write(`::warning::${w}\n`)
  }
  for (const e of errors) {
    process.stderr.write(`::error::${e}\n`)
  }

  const uniqueCompared = new Set(comparedIds).size
  process.stdout.write(
    `\nregister-consistency: ${tableRows.length} table row(s), ${sections.length} narrative ` +
      `section(s), ${claims.length} narrative claim(s) — ${uniqueCompared} id(s) recorded in ` +
      `both places and compared, ${errors.length} error(s), ${warnings.length} warning(s).\n`
  )

  if (errors.length > 0) {
    process.stderr.write(
      "register-consistency: FAILED — features/OPEN-DEFERRED-STATUS.md contradicts itself or " +
        "features/INDEX.md. See .claude/rules/general.md (Deployment/Supersession Bookkeeping " +
        "Procedure) and scripts/check-register-consistency/analyze.ts.\n"
    )
    return 1
  }
  process.stdout.write("register-consistency: OK.\n")
  return 0
}

process.exit(main())
