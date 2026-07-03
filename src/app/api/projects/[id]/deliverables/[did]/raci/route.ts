import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { isValidMaRoleKey } from "@/lib/project-types/catalog"

// PROJ-104 — RACI assignments for a deliverable (raci_assignments target_type
// 'deliverable', unlocked by this slice). Authority + "one Accountable" rule
// live in set_deliverable_raci / clear_deliverable_raci.

const RACI_LETTERS = ["R", "A", "C", "I"] as const
const setSchema = z.object({
  role_key: z.string().min(1),
  raci_letter: z.enum(RACI_LETTERS),
})
const clearSchema = z.object({ role_key: z.string().min(1) })

type ResolveResult =
  | { ok: false; error: NextResponse }
  | {
      ok: true
      did: string
      supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]
    }

async function resolve(context: {
  params: Promise<{ id: string; did: string }>
}): Promise<ResolveResult> {
  const { id: projectId, did } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return { ok: false, error: apiError("validation_error", "Invalid project id.", 400, "id") }
  }
  if (!z.string().uuid().safeParse(did).success) {
    return { ok: false, error: apiError("validation_error", "Invalid deliverable id.", 400, "did") }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { ok: false, error: apiError("unauthorized", "Not signed in.", 401) }
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return { ok: false, error: access.error }
  return { ok: true, did, supabase }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const r = await resolve(context)
  if (!r.ok) return r.error
  const { data, error } = await r.supabase
    .from("raci_assignments")
    .select("id, role_key, raci_letter")
    .eq("target_type", "deliverable")
    .eq("target_id", r.did)
    .limit(200)
  if (error) return apiError("lookup_failed", error.message, 500)
  return NextResponse.json({ assignments: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const r = await resolve(context)
  if (!r.ok) return r.error
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = setSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }
  if (!isValidMaRoleKey(parsed.data.role_key)) {
    return apiError("invalid_role", "role_key must be one of the M&A professional roles.", 400, "role_key")
  }

  const { data, error } = await r.supabase.rpc("set_deliverable_raci", {
    p_deliverable_id: r.did,
    p_role_key: parsed.data.role_key,
    p_raci_letter: parsed.data.raci_letter,
  })

  if (error) {
    if (error.code === "23505") {
      return apiError("accountable_conflict", "Another role is already Accountable (A) for this deliverable.", 409)
    }
    if (error.code === "42501") return apiError("forbidden", "Insufficient role to edit RACI.", 403)
    if (error.code === "02000") return apiError("not_found", "Deliverable not found.", 404)
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("raci_failed", error.message, 500)
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> }
) {
  const r = await resolve(context)
  if (!r.ok) return r.error
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = clearSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_error", "role_key is required.", 400, "role_key")
  }
  const { error } = await r.supabase.rpc("clear_deliverable_raci", {
    p_deliverable_id: r.did,
    p_role_key: parsed.data.role_key,
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Insufficient role to edit RACI.", 403)
    if (error.code === "02000") return apiError("not_found", "Deliverable not found.", 404)
    return apiError("raci_failed", error.message, 500)
  }
  return NextResponse.json({ ok: true })
}
