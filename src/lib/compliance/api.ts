/**
 * PROJ-18 — fetch wrappers for compliance UI.
 *
 * All endpoints are tenant- or project-scoped and gated server-side via
 * RLS + route-level auth. Client code only does network glue.
 */

import type {
  ComplianceTag,
  ComplianceWarning,
  WorkItemDocument,
  WorkItemTagRow,
} from "./types"

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

// ─── Tags ─────────────────────────────────────────────────────────────

export async function listComplianceTags(): Promise<ComplianceTag[]> {
  const response = await fetch("/api/compliance-tags", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { tags: ComplianceTag[] }
  return body.tags ?? []
}

export interface ComplianceTagPatch {
  display_name?: string
  description?: string | null
  is_active?: boolean
}

export async function updateComplianceTag(
  tagId: string,
  patch: ComplianceTagPatch
): Promise<ComplianceTag> {
  const response = await fetch(
    `/api/compliance-tags/${encodeURIComponent(tagId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { tag: ComplianceTag }
  return body.tag
}

// ─── Work-item ↔ Tag ──────────────────────────────────────────────────

export async function listWorkItemTags(
  projectId: string,
  workItemId: string
): Promise<{ link: WorkItemTagRow; tag: ComplianceTag }[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/tags`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    rows: { link: WorkItemTagRow; tag: ComplianceTag }[]
  }
  return body.rows ?? []
}

export interface AttachTagResult {
  link: WorkItemTagRow
  childWorkItemIds: string[]
  documentIds: string[]
}

export async function attachTagToWorkItem(
  projectId: string,
  workItemId: string,
  tagId: string
): Promise<AttachTagResult> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/tags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId }),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as AttachTagResult
}

export async function detachTagFromWorkItem(
  projectId: string,
  workItemId: string,
  linkId: string
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/tags/${encodeURIComponent(linkId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Documents (compliance forms) ─────────────────────────────────────

export async function listWorkItemDocuments(
  projectId: string,
  workItemId: string
): Promise<WorkItemDocument[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/documents`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { documents: WorkItemDocument[] }
  return body.documents ?? []
}

// ─── Phase-gate warnings ──────────────────────────────────────────────

export async function listPhaseComplianceWarnings(
  projectId: string,
  phaseId: string
): Promise<ComplianceWarning[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/phases/${encodeURIComponent(phaseId)}/compliance-warnings`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { warnings: ComplianceWarning[] }
  return body.warnings ?? []
}
