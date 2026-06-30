/**
 * Entry point for `npm run check:migration-naming` (PROJ-134).
 *
 * Pure file analysis of supabase/migrations/*.sql — NO database / Docker needed.
 * Enforces the migration naming + collision convention (AC-134.1..6) that keeps
 * MCP `apply_migration`-applied versions in sync with repo filenames.
 *
 * Exit codes: 0 = clean (warnings allowed), 1 = hard-fail (errors), 2 = setup error.
 */

import * as fs from "node:fs"
import * as path from "node:path"

import { analyzeMigrations, type MigrationFile } from "./analyze"

const ROOT = path.resolve(__dirname, "..", "..")
const MIGRATIONS = path.resolve(ROOT, "supabase", "migrations")

function main(): number {
  if (!fs.existsSync(MIGRATIONS)) {
    process.stderr.write(`migration-naming: ${MIGRATIONS} not found.\n`)
    return 2
  }

  const files: MigrationFile[] = fs
    .readdirSync(MIGRATIONS)
    .filter((n) => n.endsWith(".sql"))
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(MIGRATIONS, name), "utf8"),
    }))

  if (files.length === 0) {
    process.stderr.write("migration-naming: no .sql migrations found.\n")
    return 2
  }

  const { errors, warnings } = analyzeMigrations(files)

  // GitHub Actions annotations (::warning / ::error) + plain text locally.
  for (const w of warnings) {
    process.stdout.write(`::warning::${w}\n`)
  }
  for (const e of errors) {
    process.stderr.write(`::error::${e}\n`)
  }

  process.stdout.write(
    `\nmigration-naming: scanned ${files.length} migration(s) — ` +
      `${errors.length} error(s), ${warnings.length} warning(s).\n`
  )

  if (errors.length > 0) {
    process.stderr.write(
      "migration-naming: FAILED — fix the naming/collision errors above. " +
        "See docs/production/migration-naming.md.\n"
    )
    return 1
  }
  process.stdout.write("migration-naming: OK.\n")
  return 0
}

process.exit(main())
