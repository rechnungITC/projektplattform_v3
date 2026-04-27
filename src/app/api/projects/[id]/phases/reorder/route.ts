import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

const reorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1).max(100),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try { body = await request.json() } catch { return apiError("invalid_body", "Body must be JSON.", 400) }
  const parsed = reorderSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Verify all IDs belong to this project (RLS scopes too)
  const { data: existing, error: listErr } = await supabase
    .from("phases").select("id").eq("project_id", projectId).eq("is_deleted", false)
  if (listErr) return apiError("internal_error", listErr.message, 500)

  const existingIds = new Set((existing ?? []).map((r) => r.id))
  const givenIds = new Set(parsed.data.ordered_ids)

  if (existingIds.size !== givenIds.size || ![...existingIds].every((id) => givenIds.has(id))) {
    return apiError(
      "permutation_mismatch",
      "ordered_ids must be a permutation of all live phase IDs in this project.",
      422
    )
  }

  // Two-pass reorder to avoid collision on the deferrable unique index:
  // Pass 1: shift all rows to large negative numbers (won't collide with any positive).
  // Pass 2: set the final 1..N values.
  // Postgres has no batch UPDATE-with-CASE in supabase-js, so we loop.
  // Each UPDATE is one round-trip; for typical 3-10 phases this is fine.
  const offset = -1_000_000

  for (let i = 0; i < parsed.data.ordered_ids.length; i++) {
    const id = parsed.data.ordered_ids[i]
    const { error } = await supabase
      .from("phases").update({ sequence_number: offset - i }).eq("id", id).eq("project_id", projectId)
    if (error) {
      if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
      return apiError("reorder_failed", `Pass 1: ${error.message}`, 500)
    }
  }

  for (let i = 0; i < parsed.data.ordered_ids.length; i++) {
    const id = parsed.data.ordered_ids[i]
    const { error } = await supabase
      .from("phases").update({ sequence_number: i + 1 }).eq("id", id).eq("project_id", projectId)
    if (error) {
      return apiError("reorder_failed", `Pass 2: ${error.message}`, 500)
    }
  }

  return NextResponse.json({ ok: true })
}
