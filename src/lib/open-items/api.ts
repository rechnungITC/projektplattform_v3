/**
 * PROJ-20 — fetch wrappers around /api/projects/[id]/open-items + convert.
 * Convert is one-way: status `converted` is final.
 */

import type { OpenItem, OpenItemStatus } from "@/types/open-item"

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

const base = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/open-items`

export async function listOpenItems(
  projectId: string,
  options: { status?: OpenItemStatus } = {}
): Promise<OpenItem[]> {
  const url = options.status
    ? `${base(projectId)}?status=${options.status}`
    : base(projectId)
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { open_items: OpenItem[] }
  return body.open_items ?? []
}

export interface OpenItemInput {
  title: string
  description?: string | null
  status?: "open" | "in_clarification" | "closed"
  contact?: string | null
  contact_stakeholder_id?: string | null
}

export async function createOpenItem(
  projectId: string,
  input: OpenItemInput
): Promise<OpenItem> {
  const response = await fetch(base(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { open_item: OpenItem }
  return body.open_item
}

export async function updateOpenItem(
  projectId: string,
  itemId: string,
  input: Partial<OpenItemInput>
): Promise<OpenItem> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { open_item: OpenItem }
  return body.open_item
}

export async function deleteOpenItem(
  projectId: string,
  itemId: string
): Promise<void> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

export async function convertOpenItemToTask(
  projectId: string,
  itemId: string
): Promise<{ work_item_id: string }> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(itemId)}/convert-to-task`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { work_item_id: string }
}

export interface ConvertToDecisionInput {
  decision_text: string
  rationale?: string | null
  decider_stakeholder_id?: string | null
  context_phase_id?: string | null
  context_risk_id?: string | null
}

export async function convertOpenItemToDecision(
  projectId: string,
  itemId: string,
  input: ConvertToDecisionInput
): Promise<{ decision_id: string }> {
  const response = await fetch(
    `${base(projectId)}/${encodeURIComponent(itemId)}/convert-to-decision`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { decision_id: string }
}
