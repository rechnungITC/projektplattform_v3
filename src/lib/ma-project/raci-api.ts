/**
 * PROJ-97b — fetch wrappers for the RACI matrix of a work item.
 * The "Accountable = exactly one per target" rule is enforced server-side
 * (DB constraint); a 409 surfaces when a second role is set to "A".
 */

export type RaciLetter = "R" | "A" | "C" | "I"

export interface RaciAssignment {
  id: string
  role_key: string
  raci_letter: RaciLetter
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

function base(projectId: string, workItemId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(
    workItemId
  )}/raci`
}

export async function listWorkItemRaci(
  projectId: string,
  workItemId: string
): Promise<RaciAssignment[]> {
  const res = await fetch(base(projectId, workItemId), {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { assignments: RaciAssignment[] }).assignments
}

export async function setWorkItemRaci(
  projectId: string,
  workItemId: string,
  roleKey: string,
  letter: RaciLetter
): Promise<void> {
  const res = await fetch(base(projectId, workItemId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_key: roleKey, raci_letter: letter }),
  })
  if (!res.ok) throw new Error(await safeError(res))
}

export async function clearWorkItemRaci(
  projectId: string,
  workItemId: string,
  roleKey: string
): Promise<void> {
  const res = await fetch(base(projectId, workItemId), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_key: roleKey }),
  })
  if (!res.ok) throw new Error(await safeError(res))
}