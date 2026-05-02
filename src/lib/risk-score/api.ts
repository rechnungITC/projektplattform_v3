/**
 * PROJ-35 Phase 35-α — fetch wrappers around the risk-score settings route.
 *
 * GET allows any tenant member (Tooltip-read use-case); PUT and DELETE
 * are tenant-admin-only.
 */

import type { RiskScoreConfig } from "./defaults"
import type { RiskScoreOverrides } from "./merge-overrides"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

export interface RiskScoreSettings {
  defaults: RiskScoreConfig
  overrides: RiskScoreOverrides
  effective: RiskScoreConfig
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
  `/api/tenants/${encodeURIComponent(tenantId)}/settings/risk-score`

export async function fetchRiskScoreSettings(
  tenantId: string,
): Promise<RiskScoreSettings> {
  const response = await fetch(base(tenantId), {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RiskScoreSettings
}

export async function updateRiskScoreOverrides(
  tenantId: string,
  overrides: RiskScoreOverrides,
): Promise<RiskScoreSettings> {
  const response = await fetch(base(tenantId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overrides),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RiskScoreSettings
}

export async function resetRiskScoreOverrides(
  tenantId: string,
): Promise<RiskScoreSettings> {
  const response = await fetch(base(tenantId), {
    method: "DELETE",
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as RiskScoreSettings
}
