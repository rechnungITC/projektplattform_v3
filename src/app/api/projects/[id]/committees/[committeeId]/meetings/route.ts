import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createMeetingSchema } from "./_schema"

// PROJ-117 — committee meetings collection.
// GET  list a committee's meetings (RLS + need-to-know scoped)
// POST create a meeting (create_committee_meeting RPC; authority + clearance server-side)

const COLS =
  "id, tenant_id, project_id, committee_id, title, scheduled_at, ended_at, status, agenda, minutes, confidentiality_level, sort_order, created_at, updated_at"

function badIds(projectId: string, committeeId: string) {
  return (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(committeeId).success
  )
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; committeeId: string }> }
) {
  const { id: projectId, committeeId } = await context.params
  if (badIds(projectId, committeeId)) return apiError("validation_error", "Invalid id.", 400)

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("committee_meetings")
    .select(COLS)
    .eq("committee_id", committeeId)
    .order("scheduled_at", { ascending: false })
    .limit(500)
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ meetings: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; committeeId: string }> }
) {
  const { id: projectId, committeeId } = await context.params
  if (badIds(projectId, committeeId)) return apiError("validation_error", "Invalid id.", 400)

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createMeetingSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("create_committee_meeting", {
    p_committee_id: committeeId,
    p_title: d.title,
    p_scheduled_at: d.scheduled_at,
    p_agenda: d.agenda ?? null,
    p_confidentiality_level: d.confidentiality_level ?? null,
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not authorized to manage meetings.", 403)
    if (error.code === "P0002") return apiError("not_found", "Committee not found.", 404)
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ meeting: data }, { status: 201 })
}
