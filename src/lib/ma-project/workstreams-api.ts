/**
 * PROJ-102 — fetch wrappers for workstreams: per-project CRUD, M:N phase
 * assignment, and the dashboard aggregate. Consumed by the /frontend slice
 * (Workstreams tab in the M&A project room + the PROJ-101 Aufgaben dropdown).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type {
  Workstream,
  WorkstreamDashboardRow,
  WorkstreamRagStatus,
} from "@/types/workstream"

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

export async function listWorkstreams(
  projectId: string
): Promise<Workstream[]> {
  const res = await fetch(`${p(projectId)}/workstreams`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { workstreams: Workstream[] }).workstreams
}

export interface CreateWorkstreamPayload {
  workstream_key: string
  label: string
  goal?: string | null
  lead_user_id?: string | null
  rag_status?: WorkstreamRagStatus
  scope?: string | null
  notes?: string | null
  confidentiality_level?: MaConfidentialityLevel
  sort_order?: number
}

export async function createWorkstream(
  projectId: string,
  payload: CreateWorkstreamPayload
): Promise<Workstream> {
  const res = await fetch(`${p(projectId)}/workstreams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { workstream: Workstream }).workstream
}

export type UpdateWorkstreamPayload = Partial<
  Omit<CreateWorkstreamPayload, "workstream_key">
>

export async function updateWorkstream(
  projectId: string,
  wsid: string,
  payload: UpdateWorkstreamPayload
): Promise<Workstream> {
  const res = await fetch(
    `${p(projectId)}/workstreams/${encodeURIComponent(wsid)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { workstream: Workstream }).workstream
}

export async function getWorkstream(
  projectId: string,
  wsid: string
): Promise<{ workstream: Workstream; phase_ids: string[] }> {
  const res = await fetch(
    `${p(projectId)}/workstreams/${encodeURIComponent(wsid)}`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as { workstream: Workstream; phase_ids: string[] }
}

export async function deleteWorkstream(
  projectId: string,
  wsid: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/workstreams/${encodeURIComponent(wsid)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

export async function setWorkstreamPhases(
  projectId: string,
  wsid: string,
  phaseIds: string[]
): Promise<string[]> {
  const res = await fetch(
    `${p(projectId)}/workstreams/${encodeURIComponent(wsid)}/phases`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase_ids: phaseIds }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { phase_ids: string[] }).phase_ids
}

export async function fetchWorkstreamDashboard(
  projectId: string
): Promise<WorkstreamDashboardRow[]> {
  const res = await fetch(`${p(projectId)}/workstreams/dashboard`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { rows: WorkstreamDashboardRow[] }).rows
}
