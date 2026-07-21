/**
 * PROJ-117 — fetch wrappers for committee meetings (EXTEND on PROJ-98
 * committees): per-meeting agenda/minutes/attendance/documents, an atomic
 * minutes-commit that produces neutral PROJ-20 decisions + PROJ-101 tasks, an
 * authenticated ICS export, and the committee-template catalogue (AC1).
 * Writes go through SECURITY DEFINER RPCs; need-to-know is enforced server-side.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type MeetingStatus = "planned" | "held" | "cancelled"
export type AttendanceState = "present" | "absent" | "guest"
export type MeetingDocumentKind = "pre_read" | "minutes_attachment"
export type MeetingOutcomeType = "decision" | "action"

export interface CommitteeMeeting {
  id: string
  tenant_id: string
  project_id: string
  committee_id: string
  title: string
  scheduled_at: string
  ended_at: string | null
  status: MeetingStatus
  agenda: string | null
  minutes: string | null
  confidentiality_level: MaConfidentialityLevel
  sort_order: number
  created_at: string
  updated_at: string
}

export interface MeetingAttendee {
  id: string
  meeting_id: string
  stakeholder_id: string
  attendance: AttendanceState
  stakeholder?: { id: string; name: string } | null
}

export interface MeetingDocument {
  id: string
  meeting_id: string
  label: string
  url: string
  kind: MeetingDocumentKind
}

export interface MeetingOutcome {
  id: string
  meeting_id: string
  outcome_type: MeetingOutcomeType
  decision_id: string | null
  work_item_id: string | null
}

export interface MeetingDetail extends CommitteeMeeting {
  attendees: MeetingAttendee[]
  documents: MeetingDocument[]
  outcomes: MeetingOutcome[]
}

export interface CommitteeTemplate {
  id: string
  tenant_id: string
  template_key: string
  name: string
  purpose: string | null
  cadence: string | null
  default_confidentiality: MaConfidentialityLevel
  default_decision_scope: string | null
  sort_order: number
  is_active: boolean
}

export interface CommitMinutesPayload {
  decisions?: { title: string; decision_text?: string }[]
  actions?: {
    title: string
    responsible_user_id?: string | null
    due_date?: string | null
    phase_id?: string | null
    workstream_id?: string | null
  }[]
}

interface ApiErrorBody {
  error?: { message?: string }
}
async function safeError(res: Response): Promise<string> {
  try {
    return ((await res.json()) as ApiErrorBody).error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}
const cbase = (projectId: string, committeeId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/committees/${encodeURIComponent(committeeId)}/meetings`

export async function listCommitteeMeetings(
  projectId: string,
  committeeId: string
): Promise<CommitteeMeeting[]> {
  const res = await fetch(cbase(projectId, committeeId), { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { meetings?: CommitteeMeeting[] }).meetings ?? []
}

export async function getCommitteeMeeting(
  projectId: string,
  committeeId: string,
  meetingId: string
): Promise<MeetingDetail> {
  const res = await fetch(`${cbase(projectId, committeeId)}/${meetingId}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { meeting: MeetingDetail }).meeting
}

export async function createCommitteeMeeting(
  projectId: string,
  committeeId: string,
  payload: {
    title: string
    scheduled_at: string
    agenda?: string | null
    confidentiality_level?: MaConfidentialityLevel | null
  }
): Promise<CommitteeMeeting> {
  const res = await fetch(cbase(projectId, committeeId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { meeting: CommitteeMeeting }).meeting
}

export async function updateCommitteeMeeting(
  projectId: string,
  committeeId: string,
  meetingId: string,
  payload: Partial<{
    title: string
    scheduled_at: string
    ended_at: string | null
    status: MeetingStatus
    agenda: string | null
    minutes: string | null
  }>
): Promise<CommitteeMeeting> {
  const res = await fetch(`${cbase(projectId, committeeId)}/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { meeting: CommitteeMeeting }).meeting
}

export async function deleteCommitteeMeeting(
  projectId: string,
  committeeId: string,
  meetingId: string
): Promise<void> {
  const res = await fetch(`${cbase(projectId, committeeId)}/${meetingId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await safeError(res))
}

export async function setMeetingAttendee(
  projectId: string,
  committeeId: string,
  meetingId: string,
  payload: { stakeholder_id: string; attendance?: AttendanceState }
): Promise<MeetingAttendee> {
  const res = await fetch(
    `${cbase(projectId, committeeId)}/${meetingId}/attendees`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { attendee: MeetingAttendee }).attendee
}

export async function removeMeetingAttendee(
  projectId: string,
  committeeId: string,
  meetingId: string,
  attendeeId: string
): Promise<void> {
  const res = await fetch(
    `${cbase(projectId, committeeId)}/${meetingId}/attendees/${attendeeId}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

export async function addMeetingDocument(
  projectId: string,
  committeeId: string,
  meetingId: string,
  payload: { label: string; url: string; kind?: MeetingDocumentKind }
): Promise<MeetingDocument> {
  const res = await fetch(
    `${cbase(projectId, committeeId)}/${meetingId}/documents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { document: MeetingDocument }).document
}

export async function removeMeetingDocument(
  projectId: string,
  committeeId: string,
  meetingId: string,
  documentId: string
): Promise<void> {
  const res = await fetch(
    `${cbase(projectId, committeeId)}/${meetingId}/documents/${documentId}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

export async function commitMeetingMinutes(
  projectId: string,
  committeeId: string,
  meetingId: string,
  payload: CommitMinutesPayload
): Promise<{ decisions_created: number; actions_created: number }> {
  const res = await fetch(
    `${cbase(projectId, committeeId)}/${meetingId}/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as {
    decisions_created: number
    actions_created: number
  }
}

/** Authenticated, RLS-scoped ICS download of a committee's meetings (AC5). */
export function committeeMeetingsIcsUrl(
  projectId: string,
  committeeId: string
): string {
  return `${cbase(projectId, committeeId)}/ics`
}

// --- Templates (AC1) -------------------------------------------------------

const tbase = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/committee-templates`

export async function listCommitteeTemplates(
  projectId: string
): Promise<CommitteeTemplate[]> {
  const res = await fetch(tbase(projectId), { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { templates?: CommitteeTemplate[] }).templates ?? []
}

export async function seedCommitteeTemplates(
  projectId: string
): Promise<number> {
  const res = await fetch(`${tbase(projectId)}/seed`, { method: "POST" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { seeded: number }).seeded
}

export async function createCommitteeTemplate(
  projectId: string,
  payload: {
    template_key: string
    name: string
    purpose?: string | null
    cadence?: string | null
    default_confidentiality?: MaConfidentialityLevel
    default_decision_scope?: string | null
  }
): Promise<CommitteeTemplate> {
  const res = await fetch(tbase(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { template: CommitteeTemplate }).template
}

export async function createCommitteeFromTemplate(
  projectId: string,
  templateId: string
): Promise<{ id: string; name: string }> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/committees/from-template`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { committee: { id: string; name: string } }).committee
}
