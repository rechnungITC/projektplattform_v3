import { NextResponse } from "next/server"

import { setEmbargoSchema } from "../../_schema"
import { guardEntryRoute, parseBody, type EntryCtx } from "../_guard"
import { mapCommEntryRpcError } from "../route"

// PROJ-119 AC4 — embargo.
//
// POST /api/projects/[id]/communication-entries/[entryId]/embargo
//      { embargo_at: ISO-8601 with offset | null }
//
// A full timestamp, not a date: signing embargoes are hour-precise and the deal
// team is rarely in one timezone. Changing (or clearing) the embargo is the ONLY
// sanctioned way past a block — and it lands in the field-level audit trail,
// which is forensically stronger than a free-text override reason would be.

export async function POST(request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const body = await parseBody(request, setEmbargoSchema)
  if ("error" in body) return body.error

  const { data, error } = await supabase.rpc("set_communication_embargo", {
    p_entry_id: entryId,
    p_embargo_at: body.data.embargo_at,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ entry: data })
}
