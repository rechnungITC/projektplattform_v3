/**
 * PROJ-10 — fetch wrappers around the /api/audit/... surface.
 */

import type { AuditEntityType, AuditLogEntry } from "@/types/audit"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<{ message: string; code?: string }> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return {
      message: body.error?.message ?? `HTTP ${response.status}`,
      code: body.error?.code,
    }
  } catch {
    return { message: `HTTP ${response.status}` }
  }
}

export async function fetchHistory(
  entityType: AuditEntityType,
  entityId: string,
  options: { limit?: number } = {}
): Promise<AuditLogEntry[]> {
  const url = `/api/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/history${options.limit ? `?limit=${options.limit}` : ""}`
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) {
    const err = await safeError(response)
    throw new Error(err.message)
  }
  const body = (await response.json()) as { entries: AuditLogEntry[] }
  return body.entries ?? []
}

export class AuditConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuditConflictError"
  }
}

export async function undoAuditEntry(auditId: string): Promise<void> {
  const response = await fetch(
    `/api/audit/entries/${encodeURIComponent(auditId)}/undo`,
    { method: "POST" }
  )
  if (response.status === 409) {
    const err = await safeError(response)
    throw new AuditConflictError(err.message)
  }
  if (!response.ok) {
    const err = await safeError(response)
    throw new Error(err.message)
  }
}

export interface RestoreWarning {
  field: string
  reason: string
}

export async function restoreEntity(
  entityType: AuditEntityType,
  entityId: string,
  targetChangedAt: string
): Promise<{ fields_restored: number; warnings: RestoreWarning[] }> {
  const response = await fetch(
    `/api/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/restore`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_changed_at: targetChangedAt }),
    }
  )
  if (!response.ok) {
    const err = await safeError(response)
    throw new Error(err.message)
  }
  const body = (await response.json()) as {
    fields_restored: number
    warnings?: RestoreWarning[]
  }
  return {
    fields_restored: body.fields_restored,
    warnings: body.warnings ?? [],
  }
}

export interface ReportFilter {
  tenant_id: string
  entity_type?: AuditEntityType
  actor_user_id?: string
  field_name?: string
  from_date?: string
  to_date?: string
  limit?: number
}

export async function fetchReports(
  filter: ReportFilter
): Promise<AuditLogEntry[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value))
    }
  }
  const response = await fetch(`/api/audit/reports?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) {
    const err = await safeError(response)
    throw new Error(err.message)
  }
  const body = (await response.json()) as { entries: AuditLogEntry[] }
  return body.entries ?? []
}

/**
 * Trigger a CSV download of the admin export. Adds `format=csv` and an
 * optional `redaction_off` parameter to the export URL, opens it in a
 * new tab so the browser downloads naturally.
 */
export function buildExportUrl(
  filter: ReportFilter & { format?: "csv" | "json"; redaction_off?: boolean }
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value))
    }
  }
  return `/api/audit/export?${params.toString()}`
}
