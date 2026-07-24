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
  CommunicationEntry,
  CommunicationTemplate,
} from "@/types/communication-matrix"

export type {
  CommunicationEntry,
  CommunicationTemplate,
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
