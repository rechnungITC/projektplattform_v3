import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-12 — POST /api/ki/suggestions/[id]/reject
// Body: { reason?: string }
//
// Conditional UPDATE: only flips `draft` → `rejected`. Already-accepted
// or already-rejected suggestions return 409. RLS scopes the suggestion
// to the caller's projects; we additionally require editor+ on the
// project that owns the suggestion.

const bodySchema = z.object({
  reason: z.string().max(1000).optional(),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid suggestion id.", 400, "id")
  }

  let body: unknown = {}
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json()
    } catch {
      body = {}
    }
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "Invalid body.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  // Look up the suggestion to know its project for the access check.
  const { data: sug, error: lookupErr } = await supabase
    .from("ki_suggestions")
    .select("id, project_id, status")
    .eq("id", id)
    .maybeSingle()
  if (lookupErr) {
    return apiError("read_failed", lookupErr.message, 500)
  }
  if (!sug) {
    return apiError("not_found", "Suggestion not found.", 404)
  }
  if (sug.status !== "draft") {
    return apiError(
      "conflict",
      "Suggestion is no longer pending (already accepted or rejected).",
      409
    )
  }

  const access = await requireProjectAccess(
    supabase,
    sug.project_id as string,
    userId,
    "edit"
  )
  if (access.error) return access.error

  const { data: updated, error: updateErr } = await supabase
    .from("ki_suggestions")
    .update({
      status: "rejected",
      rejection_reason: parsed.data.reason ?? null,
      rejected_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft") // Optimistic: bail if it raced into another state.
    .select("id, status")
    .single()

  if (updateErr) {
    if (updateErr.code === "PGRST116") {
      return apiError(
        "conflict",
        "Suggestion changed state during the request.",
        409
      )
    }
    return apiError("update_failed", updateErr.message, 500)
  }
  return NextResponse.json({ ok: true, suggestion: updated })
}
