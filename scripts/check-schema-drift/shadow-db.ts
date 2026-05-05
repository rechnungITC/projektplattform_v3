/**
 * Shadow-DB schema dump.
 *
 * Connects to a Postgres reachable via DATABASE_URL and reads
 * `information_schema.columns` for the `public` schema. Returns
 * `Map<table, Set<column>>` — the input shape diff.ts expects.
 *
 * This module assumes the DB has already been migrated. In CI the
 * GitHub-Actions workflow applies all `supabase/migrations/*.sql` via
 * `psql` before invoking the Node script. Locally, the developer is
 * responsible for pointing DATABASE_URL at a freshly-migrated DB
 * (see scripts/check-schema-drift/README.md for the helper command).
 */

import { Client } from "pg"

import type { SchemaDump } from "./diff"

export interface DumpStats {
  tableCount: number
  columnCount: number
}

export async function dumpSchema(
  databaseUrl: string
): Promise<{ schema: SchemaDump; stats: DumpStats }> {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const result = await client.query<{
      table_name: string
      column_name: string
    }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position`
    )

    const schema: SchemaDump = new Map()
    let columnCount = 0
    for (const row of result.rows) {
      let cols = schema.get(row.table_name)
      if (cols === undefined) {
        cols = new Set()
        schema.set(row.table_name, cols)
      }
      cols.add(row.column_name)
      columnCount += 1
    }
    return {
      schema,
      stats: { tableCount: schema.size, columnCount },
    }
  } finally {
    await client.end()
  }
}
