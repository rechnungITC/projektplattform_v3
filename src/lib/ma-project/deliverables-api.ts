/**
 * PROJ-104 — fetch wrappers for deliverables: per-project CRUD, status
 * transition, document links, and RACI. Consumed by the /frontend Deliverables
 * tab in the M&A project room.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type {
  Deliverable,
  DeliverableDocument,
  DeliverableStatus,
} from "@/types/deliverable"

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

export async function listDeliverables(
  projectId: string
): Promise<Deliverable[]> {
  const res = await fetch(`${p(projectId)}/deliverables`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { deliverables: Deliverable[] }).deliverables
}

export interface CreateDeliverablePayload {
  name: string
  description?: string | null
  phase_id?: string | null
  workstream_id?: string | null
  responsible_user_id?: string | null
  due_date?: string | null
  status?: DeliverableStatus
  confidentiality_level?: MaConfidentialityLevel
  sort_order?: number
}

export async function createDeliverable(
  projectId: string,
  payload: CreateDeliverablePayload
): Promise<Deliverable> {
  const res = await fetch(`${p(projectId)}/deliverables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { deliverable: Deliverable }).deliverable
}

export type UpdateDeliverablePayload = Partial<
  Omit<CreateDeliverablePayload, "status">
>

export async function updateDeliverable(
  projectId: string,
  did: string,
  payload: UpdateDeliverablePayload
): Promise<Deliverable> {
  const res = await fetch(`${p(projectId)}/deliverables/${encodeURIComponent(did)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { deliverable: Deliverable }).deliverable
}

export async function getDeliverable(
  projectId: string,
  did: string
): Promise<{ deliverable: Deliverable; documents: DeliverableDocument[] }> {
  const res = await fetch(`${p(projectId)}/deliverables/${encodeURIComponent(did)}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as {
    deliverable: Deliverable
    documents: DeliverableDocument[]
  }
}

export async function deleteDeliverable(
  projectId: string,
  did: string
): Promise<void> {
  const res = await fetch(`${p(projectId)}/deliverables/${encodeURIComponent(did)}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await safeError(res))
}

/** Transition to planned/in_progress/in_review/suspended (approved = PROJ-105). */
export async function transitionDeliverableStatus(
  projectId: string,
  did: string,
  toStatus: Exclude<DeliverableStatus, "approved">
): Promise<Deliverable> {
  const res = await fetch(
    `${p(projectId)}/deliverables/${encodeURIComponent(did)}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: toStatus }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { deliverable: Deliverable }).deliverable
}

export async function addDeliverableDocument(
  projectId: string,
  did: string,
  payload: { title: string; url: string; tag_keys?: string[] }
): Promise<DeliverableDocument> {
  const res = await fetch(
    `${p(projectId)}/deliverables/${encodeURIComponent(did)}/documents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { document: DeliverableDocument }).document
}

export async function deleteDeliverableDocument(
  projectId: string,
  did: string,
  documentId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/deliverables/${encodeURIComponent(did)}/documents?document_id=${encodeURIComponent(documentId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

// --- RACI (target_type 'deliverable') --------------------------------------

export interface DeliverableRaciRow {
  id: string
  role_key: string
  raci_letter: "R" | "A" | "C" | "I"
}

export async function listDeliverableRaci(
  projectId: string,
  did: string
): Promise<DeliverableRaciRow[]> {
  const res = await fetch(
    `${p(projectId)}/deliverables/${encodeURIComponent(did)}/raci`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { assignments: DeliverableRaciRow[] }).assignments
}

export async function setDeliverableRaci(
  projectId: string,
  did: string,
  roleKey: string,
  raciLetter: "R" | "A" | "C" | "I"
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/deliverables/${encodeURIComponent(did)}/raci`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_key: roleKey, raci_letter: raciLetter }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
}

export async function clearDeliverableRaci(
  projectId: string,
  did: string,
  roleKey: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/deliverables/${encodeURIComponent(did)}/raci`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_key: roleKey }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
}
