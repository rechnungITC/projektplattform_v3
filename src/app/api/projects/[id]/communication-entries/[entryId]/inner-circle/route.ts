import { NextResponse } from "next/server"

import {
  innerCircleMemberSchema,
  setInnerCircleSchema,
} from "../../_schema"
import { guardEntryRoute, parseBody, type EntryCtx } from "../_guard"
import { mapCommEntryRpcError } from "../route"

// PROJ-119 AC3 — inner circle: a named person list that overrides the
// tenant-admin bypass.
//
// GET    …/inner-circle          — list members (RLS-gated: invisible unless the
//                                  caller may see the entry itself, so the list
//                                  cannot be used to infer a hidden entry).
// POST   …/inner-circle          — { enabled } toggle the marking. Enabling
//                                  auto-adds actor + responsible person so the
//                                  entry can never be orphaned.
// PUT    …/inner-circle          — { user_id } add a member.
// DELETE …/inner-circle?user_id= — remove a member (never the last one).

const MEMBER_SELECT = "id, entry_id, user_id, added_by, created_at"

export async function GET(_request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const { data, error } = await supabase
    .from("communication_entry_inner_circle")
    .select(MEMBER_SELECT)
    .eq("entry_id", entryId)
    .order("created_at", { ascending: true })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ members: data ?? [] })
}

export async function POST(request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const body = await parseBody(request, setInnerCircleSchema)
  if ("error" in body) return body.error

  const { data, error } = await supabase.rpc("set_communication_inner_circle", {
    p_entry_id: entryId,
    p_enabled: body.data.enabled,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ entry: data })
}

export async function PUT(request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const body = await parseBody(request, innerCircleMemberSchema)
  if ("error" in body) return body.error

  const { error } = await supabase.rpc("add_communication_inner_circle_member", {
    p_entry_id: entryId,
    p_user_id: body.data.user_id,
  })
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, context: EntryCtx) {
  const g = await guardEntryRoute(context)
  if ("error" in g) return g.error
  const { supabase, entryId } = g

  const userId = new URL(request.url).searchParams.get("user_id")
  const parsed = innerCircleMemberSchema.safeParse({ user_id: userId })
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "A valid user_id query parameter is required.",
        },
      },
      { status: 400 }
    )
  }

  const { error } = await supabase.rpc(
    "remove_communication_inner_circle_member",
    { p_entry_id: entryId, p_user_id: parsed.data.user_id }
  )
  if (error) return mapCommEntryRpcError(error)
  return NextResponse.json({ ok: true })
}
