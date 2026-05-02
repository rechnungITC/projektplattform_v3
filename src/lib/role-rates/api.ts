/**
 * PROJ-24 — fetch wrappers for /api/tenants/[id]/role-rates.
 */

import type { RoleRate, RoleRateInput } from "@/types/role-rate"

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

const base = (tenantId: string) =>
  `/api/tenants/${encodeURIComponent(tenantId)}/role-rates`

export async function listRoleRates(tenantId: string): Promise<RoleRate[]> {
  const res = await fetch(base(tenantId), { method: "GET", cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { rates: RoleRate[] }
  return body.rates ?? []
}

export async function createRoleRate(
  tenantId: string,
  input: RoleRateInput
): Promise<RoleRate> {
  const res = await fetch(base(tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { rate: RoleRate }
  return body.rate
}

export async function deleteRoleRate(
  tenantId: string,
  rateId: string
): Promise<void> {
  const res = await fetch(
    `${base(tenantId)}/${encodeURIComponent(rateId)}`,
    { method: "DELETE" }
  )
  if (!res.ok && res.status !== 204) throw new Error(await safeError(res))
}
