import { NextResponse } from "next/server"

import { guardEntryRoute, type EntryCtx } from "../_guard"
import { mapCommEntryRpcError } from "../route"

// PROJ-119 — the ONLY way to read a communication entry's body.
//
// GET /api/projects/[id]/communication-entries/[entryId]/content
//
// The list endpoint deliberately withholds `message` for inner-circle entries
// (B2), so reading content is an explicit act — and `read_communication_content`
// writes exactly one access-log row per call, granted or denied. That is what
// makes the "audit trail records every access to inner-circle content"
// guarantee literally true rather than aspirational.
//
// Authorisation lives entirely in the RPC (it re-states the same predicate the
// SELECT policies enforce); this route never second-guesses it.

interface ContentRow {
  message: string | null
  allowed: boolean
}

export async function GET(_request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const { data, error } = await supabase.rpc("read_communication_content", {
    p_entry_id: entryId,
  })
  if (error) return mapCommEntryRpcError(error)

  const row = (Array.isArray(data) ? data[0] : data) as ContentRow | undefined
  if (!row || !row.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "forbidden",
          message:
            "This entry is restricted to its inner circle. The attempt has been logged.",
        },
      },
      { status: 403 }
    )
  }
  return NextResponse.json({ message: row.message })
}
