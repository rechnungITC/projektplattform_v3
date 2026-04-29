/**
 * PROJ-17 — fetch wrappers around /api/tenants/[id]/settings.
 * Admin-only endpoints; the underlying API enforces tenant_admin via RLS.
 */

import type {
  AiProviderConfig,
  ModuleKey,
  PrivacyDefaults,
  RetentionOverrides,
  TenantSettings,
} from "@/types/tenant-settings"

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
  `/api/tenants/${encodeURIComponent(tenantId)}/settings`

export async function getTenantSettings(
  tenantId: string
): Promise<TenantSettings> {
  const response = await fetch(base(tenantId), {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { settings: TenantSettings }
  return body.settings
}

export interface TenantSettingsPatch {
  active_modules?: ModuleKey[]
  privacy_defaults?: PrivacyDefaults
  ai_provider_config?: AiProviderConfig
  retention_overrides?: RetentionOverrides
}

export async function updateTenantSettings(
  tenantId: string,
  patch: TenantSettingsPatch
): Promise<TenantSettings> {
  const response = await fetch(base(tenantId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { settings: TenantSettings }
  return body.settings
}
