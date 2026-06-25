/**
 * PROJ-112 — fetch wrappers for the Due-Diligence stream backbone: per-project
 * DD streams (activate / edit / status-transition / delete) and the tenant-wide
 * stream template catalog. Consumed by the /frontend slice (DD overview in the
 * M&A project room + the Stammdaten template catalog).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type DdStreamStatus =
  | "not_started"
  | "started"
  | "in_review"
  | "findings_consolidated"
  | "completed"

export interface DdStream {
  id: string
  tenant_id: string
  project_id: string
  stream_key: string
  label: string
  stream_lead_user_id: string | null
  status: DdStreamStatus
  planned_start: string | null
  planned_end: string | null
  scope: string | null
  notes: string | null
  confidentiality_level: MaConfidentialityLevel
  phase_id: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  /** Forward-compatible (PROJ-113/114): null until those tables exist → render "—", never 0. */
  open_findings: number | null
  open_questions: number | null
}

export interface DdStreamTemplate {
  id: string
  tenant_id: string
  stream_key: string
  label: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}

// --- DD streams (per project) ---------------------------------------------

export async function listDdStreams(projectId: string): Promise<DdStream[]> {
  const res = await fetch(`${p(projectId)}/dd-streams`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { streams: DdStream[] }).streams
}

export interface CreateDdStreamPayload {
  stream_key: string
  label: string
  stream_lead_user_id?: string | null
  planned_start?: string | null
  planned_end?: string | null
  scope?: string | null
  notes?: string | null
  confidentiality_level?: MaConfidentialityLevel
  phase_id?: string | null
  sort_order?: number
}

export async function createDdStream(
  projectId: string,
  payload: CreateDdStreamPayload
): Promise<DdStream> {
  const res = await fetch(`${p(projectId)}/dd-streams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { stream: DdStream }).stream
}

export type UpdateDdStreamPayload = Partial<
  Omit<CreateDdStreamPayload, "stream_key">
>

export async function updateDdStream(
  projectId: string,
  streamId: string,
  payload: UpdateDdStreamPayload
): Promise<DdStream> {
  const res = await fetch(
    `${p(projectId)}/dd-streams/${encodeURIComponent(streamId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { stream: DdStream }).stream
}

export async function transitionDdStreamStatus(
  projectId: string,
  streamId: string,
  toStatus: DdStreamStatus,
  comment?: string | null
): Promise<DdStream> {
  const res = await fetch(
    `${p(projectId)}/dd-streams/${encodeURIComponent(streamId)}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: toStatus, comment: comment ?? null }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { stream: DdStream }).stream
}

export async function deleteDdStream(
  projectId: string,
  streamId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/dd-streams/${encodeURIComponent(streamId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

// --- Template catalog (tenant) --------------------------------------------

export async function listDdStreamTemplates(): Promise<DdStreamTemplate[]> {
  const res = await fetch(`/api/dd-stream-templates`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { templates: DdStreamTemplate[] }).templates
}

export interface CreateTemplatePayload {
  stream_key: string
  label: string
  description?: string | null
  sort_order?: number
  is_active?: boolean
}

export async function createDdStreamTemplate(
  payload: CreateTemplatePayload
): Promise<DdStreamTemplate> {
  const res = await fetch(`/api/dd-stream-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { template: DdStreamTemplate }).template
}

export type UpdateTemplatePayload = Partial<
  Omit<CreateTemplatePayload, "stream_key">
>

export async function updateDdStreamTemplate(
  templateId: string,
  payload: UpdateTemplatePayload
): Promise<DdStreamTemplate> {
  const res = await fetch(
    `/api/dd-stream-templates/${encodeURIComponent(templateId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { template: DdStreamTemplate }).template
}

export async function deleteDdStreamTemplate(templateId: string): Promise<void> {
  const res = await fetch(
    `/api/dd-stream-templates/${encodeURIComponent(templateId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}