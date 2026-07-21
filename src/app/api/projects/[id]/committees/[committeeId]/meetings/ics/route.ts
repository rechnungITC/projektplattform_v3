import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-117 (AC5) — authenticated, RLS-scoped ICS export of a committee's
// meetings (RFC 5545, no dependency). Only meetings the caller may see are
// included (need-to-know preserved server-side). NOT a public subscribable
// feed — a tokenized feed would bypass the need-to-know gate (deferred
// PROJ-Y-117a). Static `ics` segment wins over the sibling `[meetingId]`.

interface MeetingRow {
  id: string
  title: string
  scheduled_at: string
  ended_at: string | null
  status: string
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

function toIcsUtc(iso: string): string {
  // YYYYMMDDTHHMMSSZ
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; committeeId: string }> }
) {
  const { id: projectId, committeeId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(committeeId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("committee_meetings")
    .select("id, title, scheduled_at, ended_at, status")
    .eq("committee_id", committeeId)
    .order("scheduled_at", { ascending: true })
    .limit(1000)
  if (error) return apiError("export_failed", error.message, 500)

  const rows = (data ?? []) as unknown as MeetingRow[]
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Projektplattform//Committee Meetings//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]
  for (const m of rows) {
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:${m.id}@projektplattform`)
    lines.push(`DTSTART:${toIcsUtc(m.scheduled_at)}`)
    if (m.ended_at) lines.push(`DTEND:${toIcsUtc(m.ended_at)}`)
    lines.push(`SUMMARY:${icsEscape(m.title)}`)
    lines.push(`STATUS:${m.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`)
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  const ics = lines.join("\r\n")

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `gremien-termine-${committeeId.slice(0, 8)}-${stamp}.ics`
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Scope": "meetings-visible-to-caller",
    },
  })
}
