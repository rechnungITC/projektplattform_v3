#!/usr/bin/env node
/**
 * PROJ-67 F7: build GitNexus FTS indexes with a writable connection.
 *
 * Upstream bug (gitnexus 1.6.3): `gitnexus analyze` defers FTS-index creation
 * to "lazily on first query" (core/run-analyze.js Phase 3), but every query
 * path opens the LadybugDB strictly read-only (core/lbug/pool-adapter.js:
 * "MCP server never writes"). The lazy CREATE_FTS_INDEX therefore fails on
 * every call ("Cannot execute write operations in a read-only database"),
 * BM25 search stays empty, and `gitnexus query` returns no hits.
 *
 * This script performs the deferred build once with write access. The index
 * definitions mirror core/search/bm25-index.js FTS_INDEXES — keep in sync.
 *
 * Usage:
 *   node scripts/gitnexus-build-fts.mjs [repo-root] [table]  # default: cwd, all tables
 *   npm run gitnexus:fix-fts
 *
 * Must be re-run after every `gitnexus analyze` (analyze recreates the DB
 * without FTS). Fails with a lock hint if another process (MCP server,
 * analyze) holds the database.
 *
 * The optional [table] arg builds a single index (File|Function|Class|
 * Method|Interface). Building each index in a fresh process keeps native
 * memory pressure down — one observed LadybugDB segfault occurred while
 * creating multiple large content-indexes in a single process.
 */
import { existsSync, readdirSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const FTS_INDEXES = [
  { table: 'File', indexName: 'file_fts', properties: ['name', 'content'] },
  { table: 'Function', indexName: 'function_fts', properties: ['name', 'content'] },
  { table: 'Class', indexName: 'class_fts', properties: ['name', 'content'] },
  { table: 'Method', indexName: 'method_fts', properties: ['name', 'content'] },
  { table: 'Interface', indexName: 'interface_fts', properties: ['name', 'content'] },
]

function findLadybug() {
  if (process.env.GITNEXUS_DIR) {
    return join(process.env.GITNEXUS_DIR, 'node_modules', '@ladybugdb', 'core', 'index.js')
  }
  const npxCache = join(homedir(), '.npm', '_npx')
  if (existsSync(npxCache)) {
    for (const entry of readdirSync(npxCache)) {
      const candidate = join(npxCache, entry, 'node_modules', '@ladybugdb', 'core')
      if (existsSync(candidate)) return join(candidate, 'index.js')
    }
  }
  throw new Error(
    '@ladybugdb/core not found. Run `npx gitnexus status` once (populates the npx cache) ' +
      'or set GITNEXUS_DIR to the gitnexus install directory.',
  )
}

const repoRoot = resolve(process.argv[2] ?? process.cwd())
const tableFilter = process.argv[3]
const indexesToBuild = tableFilter
  ? FTS_INDEXES.filter((d) => d.table === tableFilter)
  : FTS_INDEXES
if (tableFilter && indexesToBuild.length === 0) {
  console.error(`Unknown table "${tableFilter}". Valid: ${FTS_INDEXES.map((d) => d.table).join(', ')}`)
  process.exit(1)
}
const dbPath = join(repoRoot, '.gitnexus', 'lbug')
if (!existsSync(dbPath)) {
  console.error(`No GitNexus index at ${dbPath} — run \`npx gitnexus analyze\` first.`)
  process.exit(1)
}

const lbug = (await import(pathToFileURL(findLadybug()).href)).default

let db
try {
  db = new lbug.Database(dbPath) // default open mode = writable
} catch (err) {
  const msg = String(err?.message ?? err)
  if (msg.toLowerCase().includes('lock')) {
    console.error(
      `Database is locked: ${msg}\n` +
        'Close running gitnexus MCP servers / analyze processes and retry.',
    )
    process.exit(1)
  }
  throw err
}
const conn = new lbug.Connection(db)

try {
  await conn.query('LOAD EXTENSION fts')
} catch {
  await conn.query('INSTALL fts')
  await conn.query('LOAD EXTENSION fts')
}

// The LadybugDB native module has been observed to segfault during process
// teardown AFTER a successful CREATE_FTS_INDEX commit. Block-buffered stdout
// is lost in that crash, so log synchronously straight to the fd.
const log = (msg) => writeSync(1, msg + '\n')

let created = 0
let existing = 0
for (const { table, indexName, properties } of indexesToBuild) {
  const propList = properties.map((p) => `'${p}'`).join(', ')
  try {
    await conn.query(
      `CALL CREATE_FTS_INDEX('${table}', '${indexName}', [${propList}], stemmer := 'porter')`,
    )
    log(`created ${indexName} on ${table}(${properties.join(', ')})`)
    created += 1
  } catch (err) {
    const msg = String(err?.message ?? err)
    if (msg.includes('already exists')) {
      log(`exists  ${indexName}`)
      existing += 1
    } else {
      throw err
    }
  }
  // Verify the index is queryable before this process exits — a teardown
  // segfault after this line is cosmetic, the commit already happened.
  const rows = await conn.query(
    `CALL QUERY_FTS_INDEX('${table}', '${indexName}', 'tenant', conjunctive := false) RETURN node.name LIMIT 1`,
  )
  const got = await rows.getAll()
  log(`verify  ${indexName}: queryable (${got.length} sample hit(s) for 'tenant')`)
}
log(`Done: ${created} created, ${existing} already existed.`)
log('(a segmentation fault after this line is a known LadybugDB teardown bug — the indexes are committed)')
process.exit(0)
