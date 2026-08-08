import { NextResponse } from "next/server"

import { dissolveInnerCircleSchema } from "../../_schema"
import { guardEntryRoute, parseBody, type EntryCtx } from "../_guard"
import { mapCommEntryRpcError } from "../route"

// PROJ-119 — break-glass (Fork 1).
//
// POST /api/projects/[id]/communication-entries/[entryId]/dissolve
//
// A tenant admin outside the circle cannot read a restricted entry — but they
// can DISSOLVE the circle, which is deliberately loud: it writes an access-log
// row AND a field-level audit entry carrying the mandatory reason. This is the
// availability escape hatch (deactivated members, departed staff) without
// reintroducing a silent admin bypass.

export async function POST(request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const body = await parseBody(request, dissolveInnerCircleSchema)
  if ("error" in body) return body.error

  const { data, error } = await supabase.rpc("dissolve_inner_circle", {
    p_entry_id: entryId,
    p_reason: body.data.reason,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ entry: data })
}
