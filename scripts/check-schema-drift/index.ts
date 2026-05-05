/**
 * Entry point for `npm run check:schema-drift`.
 *
 * Reads DATABASE_URL from the environment, dumps the public schema,
 * walks every TypeScript file under src/ that isn't a test, diffs the
 * SELECT calls against the dump, and exits 0 (clean) or 1 (drift).
 */

import * as fs from "node:fs"
import * as path from "node:path"

import { walkFiles } from "./ast-walker"
import { diffCalls } from "./diff"
import { formatFailure, formatSuccess } from "./reporter"
import { dumpSchema } from "./shadow-db"

const ROOT = path.resolve(__dirname, "..", "..")
const SRC = path.resolve(ROOT, "src")
const TS_EXTS = new Set([".ts", ".tsx"])
const SKIP_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"]
const SKIP_DIR_NAMES = new Set(["node_modules", "__fixtures__", "test", "__tests__"])

function listSourceFiles(dir: string, sink: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      listSourceFiles(full, sink)
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name)
    if (!TS_EXTS.has(ext)) continue
    if (SKIP_FILE_SUFFIXES.some((s) => entry.name.endsWith(s))) continue
    sink.push(full)
  }
}

async function main(): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    process.stderr.write(
      "schema-drift: DATABASE_URL is not set. " +
        "Set it to a freshly-migrated Postgres (CI does this automatically).\n"
    )
    return 2
  }

  const files: string[] = []
  listSourceFiles(SRC, files)

  const calls = walkFiles(files)
  const { schema, stats } = await dumpSchema(databaseUrl)
  const result = diffCalls(calls, schema)

  if (result.drifts.length === 0) {
    process.stdout.write(formatSuccess(result, stats.tableCount) + "\n")
    return 0
  }

  process.stderr.write(formatFailure(result) + "\n")
  return 1
}

main()
  .then((code) => {
    process.exit(code)
  })
  .catch((err) => {
    process.stderr.write(
      `schema-drift: unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
    )
    process.exit(2)
  })
