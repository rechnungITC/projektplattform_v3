import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { updateMeetingSchema } from "../_schema"

// PROJ-117 — single meeting: detail (meeting + attendees + documents + outcomes),
// update (update_committee_meeting), delete (delete_committee_meeting).

const COLS =
  "id, tenant_id, project_id, committee_id, title, scheduled_at, ended_at, status, agenda, minutes, confidentiality_level, sort_order, created_at, updated_at"

type Ctx = { params: Promise<{ id: string; committeeId: string; meetingId: string }> }

function bad(...ids: string[]) {
  return ids.some((v) => !z.string().uuid().safeParse(v).success)
}

export async function GET(_request: Request, context: Ctx) {
  const { id: projectId, meetingId } = await context.params
  if (bad(projectId, meetingId)) return apiError("validation_error", "Invalid id.", 400)

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data: meeting, error } = await supabase
    .from("committee_meetings")
    .select(COLS)
    .eq("id", meetingId)
    .maybeSingle()
  if (error) return apiError("read_failed", error.message, 500)
  if (!meeting) return apiError("not_found", "Meeting not found.", 404)

  const [attendees, documents, outcomes] = await Promise.all([
    supabase
      .from("committee_meeting_attendees")
      .select("id, meeting_id, stakeholder_id, attendance, stakeholder:stakeholders(id, name)")
      .eq("meeting_id", meetingId),
    supabase
      .from("committee_meeting_documents")
      .select("id, meeting_id, label, url, kind")
      .eq("meeting_id", meetingId),
    supabase
      .from("committee_meeting_outcomes")
      .select("id, meeting_id, outcome_type, decision_id, work_item_id")
      .eq("meeting_id", meetingId),
  ])

  return NextResponse.json({
    meeting: {
      ...meeting,
      attendees: attendees.data ?? [],
      documents: documents.data ?? [],
      outcomes: outcomes.data ?? [],
    },
  })
}

export async function PATCH(request: Request, context: Ctx) {
  const { id: projectId, meetingId } = await context.params
  if (bad(projectId, meetingId)) return apiError("validation_error", "Invalid id.", 400)

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
  const parsed = updateMeetingSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid body.", 400, first?.path?.[0]?.toString())
  }
  const d = parsed.data

  const { data, error } = await supabase.rpc("update_committee_meeting", {
    p_meeting_id: meetingId,
    p_title: d.title ?? null,
    p_scheduled_at: d.scheduled_at ?? null,
    p_ended_at: d.ended_at ?? null,
    p_status: d.status ?? null,
    p_agenda: d.agenda ?? null,
    p_minutes: d.minutes ?? null,
  })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not authorized.", 403)
    if (error.code === "P0002") return apiError("not_found", "Meeting not found.", 404)
    if (error.code === "22023") return apiError("validation_error", error.message, 400)
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ meeting: data })
}

export async function DELETE(_request: Request, context: Ctx) {
  const { id: projectId, meetingId } = await context.params
  if (bad(projectId, meetingId)) return apiError("validation_error", "Invalid id.", 400)

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { error } = await supabase.rpc("delete_committee_meeting", { p_meeting_id: meetingId })
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not authorized.", 403)
    if (error.code === "P0002") return apiError("not_found", "Meeting not found.", 404)
    return apiError("delete_failed", error.message, 500)
  }
  return NextResponse.json({ ok: true })
}
