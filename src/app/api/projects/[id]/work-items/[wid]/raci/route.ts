import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { isValidMaRoleKey } from "@/lib/project-types/catalog"

// PROJ-97b — RACI assignments for a work item.
//
// GET    /api/projects/[id]/work-items/[wid]/raci         → list assignments
// POST   /api/projects/[id]/work-items/[wid]/raci         → set { role_key, raci_letter }
// DELETE /api/projects/[id]/work-items/[wid]/raci         → clear { role_key }
//
// The role is a professional role (role_key), validated app-layer against the
// M&A role catalog. The set/clear RPCs own authority + the "Accountable =
// exactly one per target" DB rule (partial unique → 23505 → 409 here).

const RACI_LETTERS = ["R", "A", "C", "I"] as const

const setSchema = z.object({
  role_key: z.string().min(1),
  raci_letter: z.enum(RACI_LETTERS),
})
const clearSchema = z.object({ role_key: z.string().min(1) })

interface RaciRow {
  id: string
  role_key: string
  raci_letter: string
}

type ResolveResult =
  | { ok: false; error: NextResponse }
  | {
      ok: true
      projectId: string
      wid: string
      supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]
    }

async function resolve(context: {
  params: Promise<{ id: string; wid: string }>
}): Promise<ResolveResult> {
  const { id: projectId, wid } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return {
      ok: false,
      error: apiError("validation_error", "Invalid project id.", 400, "id"),
    }
  }
  if (!z.string().uuid().safeParse(wid).success) {
    return {
      ok: false,
      error: apiError("validation_error", "Invalid work item id.", 400, "wid"),
    }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return { ok: false, error: apiError("unauthorized", "Not signed in.", 401) }
  }
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return { ok: false, error: access.error }
  return { ok: true, projectId, wid, supabase }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
) {
  const r = await resolve(context)
  if (!r.ok) return r.error

  const { data, error } = await r.supabase
    .from("raci_assignments")
    .select("id, role_key, raci_letter")
    .eq("target_type", "work_item")
    .eq("target_id", r.wid)
    .limit(200)

  if (error) return apiError("lookup_failed", error.message, 500)
  return NextResponse.json({ assignments: (data ?? []) as RaciRow[] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
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
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }
  if (!isValidMaRoleKey(parsed.data.role_key)) {
    return apiError(
      "invalid_role",
      "role_key must be one of the M&A professional roles.",
      400,
      "role_key"
    )
  }

  const { data, error } = await r.supabase.rpc("set_work_item_raci", {
    p_work_item_id: r.wid,
    p_role_key: parsed.data.role_key,
    p_raci_letter: parsed.data.raci_letter,
  })

  if (error) {
    if (error.code === "23505") {
      return apiError(
        "accountable_conflict",
        "Another role is already Accountable (A) for this work item. Reassign it first.",
        409
      )
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Insufficient role to edit RACI.", 403)
    }
    if (error.code === "02000") {
      return apiError("not_found", "Work item not found.", 404)
    }
    if (error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("raci_failed", error.message, 500)
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; wid: string }> }
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

  const { data, error } = await r.supabase.rpc("clear_work_item_raci", {
    p_work_item_id: r.wid,
    p_role_key: parsed.data.role_key,
  })

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Insufficient role to edit RACI.", 403)
    }
    if (error.code === "02000") {
      return apiError("not_found", "Work item not found.", 404)
    }
    return apiError("raci_failed", error.message, 500)
  }
  return NextResponse.json(data)
}