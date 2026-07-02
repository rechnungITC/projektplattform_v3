import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { updateCommitteeMemberSchema } from "../../../_schema"

// PROJ-98 — single committee member.
//
// PATCH  .../members/[memberId] — update role/voting via update_committee_member RPC.
// DELETE .../members/[memberId] — remove via remove_committee_member RPC.

type Ctx = {
  params: Promise<{ id: string; committeeId: string; memberId: string }>
}

async function guard(context: Ctx) {
  const { id: projectId, committeeId, memberId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(committeeId).success ||
    !z.string().uuid().safeParse(memberId).success
  ) {
    return { error: apiError("validation_error", "Invalid id.", 400) }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return { error: access.error }
  return { supabase, memberId }
}

function mapRpcError(error: { code?: string; message: string }) {
  if (error.code === "42501") {
    return apiError("forbidden", "Not authorized for this member.", 403)
  }
  if (error.code === "P0002") {
    return apiError("not_found", "Committee member not found.", 404)
  }
  if (error.code?.startsWith("23") || error.code === "22023") {
    return apiError("validation_error", error.message, 400)
  }
  return apiError("mutation_failed", error.message, 500)
}

export async function PATCH(request: Request, context: Ctx) {
  const g = await guard(context)
  if ("error" in g) return g.error
  const { supabase, memberId } = g

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateCommitteeMemberSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("update_committee_member", {
    p_member_id: memberId,
    p_role_in_committee: d.role_in_committee ?? null,
    p_is_voting: d.is_voting ?? null,
  })
  if (error) return mapRpcError(error)
  return NextResponse.json({ member: data })
}

export async function DELETE(_request: Request, context: Ctx) {
  const g = await guard(context)
  if ("error" in g) return g.error
  const { supabase, memberId } = g

  const { error } = await supabase.rpc("remove_committee_member", {
    p_member_id: memberId,
  })
  if (error) return mapRpcError(error)
  return NextResponse.json({ ok: true })
}
