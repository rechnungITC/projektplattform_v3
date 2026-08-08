import { NextResponse } from "next/server"

import { guardEntryRoute, type EntryCtx } from "../_guard"
import { mapCommEntryRpcError } from "../route"

// PROJ-119 — read the append-only access log for one entry.
//
// GET /api/projects/[id]/communication-entries/[entryId]/access-log
//
// Gated by exactly the same predicate as the entry itself: if you may not see
// the entry, you may not see who looked at it (otherwise the log would leak the
// circle's membership). A tenant admin who needs to audit a restricted entry
// must dissolve the circle first — which is itself logged.
//
// The log has no INSERT/UPDATE/DELETE policy, so it is append-only from the
// application's point of view; rows are only ever written by SECURITY DEFINER
// RPCs.

const LOG_SELECT = "id, entry_id, user_id, action, outcome, created_at"

interface LogRow {
  user_id: string
}

export async function GET(_request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const { data, error } = await supabase
    .from("communication_access_log")
    .select(LOG_SELECT)
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) return mapCommEntryRpcError(error)

  const rows = (data ?? []) as LogRow[]
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const names = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds)
    for (const p of (profiles ?? []) as {
      id: string
      display_name: string | null
      email: string | null
    }[]) {
      names.set(p.id, p.display_name ?? p.email ?? p.id.slice(0, 8))
    }
  }

  return NextResponse.json({
    entries: rows.map((r) => ({ ...r, user_name: names.get(r.user_id) ?? null })),
  })
}
