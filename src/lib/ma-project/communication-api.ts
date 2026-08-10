/**
 * PROJ-118 — fetch wrappers for the Kommunikationsmatrix: per-project
 * communication planning entries (target group, message, channel, dates) with
 * a single-approver workflow (submit → respond → mark sent) plus a
 * tenant-scoped template catalogue. Consumed by the /frontend slice
 * (Kommunikation section in the project room). Writes go through SECURITY
 * DEFINER RPCs behind these routes; SoD + need-to-know are enforced server-side.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type {
  CommunicationAccessLogEntry,
  CommunicationEntry,
  CommunicationTemplate,
  InnerCircleMember,
} from "@/types/communication-matrix"

export type {
  CommunicationAccessLogEntry,
  CommunicationEntry,
  CommunicationTemplate,
  InnerCircleMember,
} from "@/types/communication-matrix"

export interface CommunicationEntryPayload {
  target_group_key: string
  target_group_label?: string | null
  message?: string | null
  channel?: string | null
  planned_date?: string | null
  responsible_user_id?: string | null
  approver_user_id?: string | null
  confidentiality_level?: MaConfidentialityLevel
  template_id?: string | null
  phase_id?: string | null
  stage_gate_id?: string | null
  work_item_id?: string | null
}

// Update payload has no template_id (matches update_communication_entry).
export type CommunicationEntryUpdatePayload = Omit<
  CommunicationEntryPayload,
  "template_id"
>

export interface CommunicationTemplatePayload {
  template_key: string
  name: string
  default_target_group_key?: string | null
  default_channel?: string | null
  default_confidentiality?: MaConfidentialityLevel
  body_skeleton?: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

const entriesBase = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/communication-entries`
const templatesBase = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/communication-templates`

// ── Entries ────────────────────────────────────────────────────────────────

export async function listEntries(
  projectId: string
): Promise<CommunicationEntry[]> {
  const res = await fetch(entriesBase(projectId), { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as { entries?: CommunicationEntry[] }
  return json.entries ?? []
}

export async function createEntry(
  projectId: string,
  payload: CommunicationEntryPayload
): Promise<CommunicationEntry> {
  const res = await fetch(entriesBase(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

export async function updateEntry(
  projectId: string,
  entryId: string,
  payload: CommunicationEntryUpdatePayload
): Promise<CommunicationEntry> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

export async function deleteEntry(
  projectId: string,
  entryId: string
): Promise<void> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await safeError(res))
}

export async function submitEntry(
  projectId: string,
  entryId: string
): Promise<CommunicationEntry> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/submit`, {
    method: "POST",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

export async function respondApproval(
  projectId: string,
  entryId: string,
  payload: { approved: boolean; reason?: string | null }
): Promise<CommunicationEntry> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

export async function markSent(
  projectId: string,
  entryId: string
): Promise<CommunicationEntry> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/mark-sent`, {
    method: "POST",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

// ── PROJ-119: inner circle, embargo, content access ─────────────────────────

/**
 * Fetch an entry's body. This is the ONLY path to inner-circle content and it
 * is logged server-side on every call, granted or denied — which is what makes
 * the "every access is audited" guarantee real rather than aspirational.
 */
export async function readEntryContent(
  projectId: string,
  entryId: string
): Promise<string | null> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/content`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { message: string | null }).message
}

export async function setInnerCircle(
  projectId: string,
  entryId: string,
  enabled: boolean
): Promise<CommunicationEntry> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/inner-circle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

export async function listInnerCircle(
  projectId: string,
  entryId: string
): Promise<InnerCircleMember[]> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/inner-circle`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { members?: InnerCircleMember[] }).members ?? []
}

export async function addInnerCircleMember(
  projectId: string,
  entryId: string,
  userId: string
): Promise<void> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/inner-circle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
  if (!res.ok) throw new Error(await safeError(res))
}

export async function removeInnerCircleMember(
  projectId: string,
  entryId: string,
  userId: string
): Promise<void> {
  const res = await fetch(
    `${entriesBase(projectId)}/${entryId}/inner-circle?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

/** Tenant-admin break-glass: dissolve the circle loudly (never read silently). */
export async function dissolveInnerCircle(
  projectId: string,
  entryId: string,
  reason: string
): Promise<CommunicationEntry> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/dissolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

export async function setEmbargo(
  projectId: string,
  entryId: string,
  embargoAt: string | null
): Promise<CommunicationEntry> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/embargo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embargo_at: embargoAt }),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { entry: CommunicationEntry }).entry
}

export async function listAccessLog(
  projectId: string,
  entryId: string
): Promise<CommunicationAccessLogEntry[]> {
  const res = await fetch(`${entriesBase(projectId)}/${entryId}/access-log`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return (
    ((await res.json()) as { entries?: CommunicationAccessLogEntry[] }).entries ?? []
  )
}

/** URL for the gated CSV export (standard/confidential only — see AC2 matrix). */
export function entryExportUrl(projectId: string, entryId: string): string {
  return `${entriesBase(projectId)}/${entryId}/export?as=csv`
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTemplates(
  projectId: string
): Promise<CommunicationTemplate[]> {
  const res = await fetch(templatesBase(projectId), { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as { templates?: CommunicationTemplate[] }
  return json.templates ?? []
}

export async function seedTemplates(projectId: string): Promise<number> {
  const res = await fetch(`${templatesBase(projectId)}/seed`, { method: "POST" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { seeded: number }).seeded
}

export async function createTemplate(
  projectId: string,
  payload: CommunicationTemplatePayload
): Promise<CommunicationTemplate> {
  const res = await fetch(templatesBase(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { template: CommunicationTemplate }).template
}
