/**
 * PROJ-33 Phase 33-β — fetch wrappers for stakeholder-type-catalog.
 */

import type {
  StakeholderType,
  StakeholderTypeInput,
} from "@/types/stakeholder-type"

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

const base = "/api/stakeholder-types"

export async function listStakeholderTypes(): Promise<StakeholderType[]> {
  const response = await fetch(base, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { types: StakeholderType[] }
  return body.types ?? []
}

export async function createStakeholderType(
  input: StakeholderTypeInput,
): Promise<StakeholderType> {
  const response = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { type: StakeholderType }
  return body.type
}

export async function updateStakeholderType(
  id: string,
  input: Partial<StakeholderTypeInput>,
): Promise<StakeholderType> {
  const response = await fetch(`${base}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { type: StakeholderType }
  return body.type
}

export async function deactivateStakeholderType(id: string): Promise<void> {
  const response = await fetch(`${base}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!response.ok) throw new Error(await safeError(response))
}
