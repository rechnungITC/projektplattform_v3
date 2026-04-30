/**
 * PROJ-16 — fetch wrappers for the master-data UI surfaces.
 *
 * All three sub-areas (project-type overrides, method overrides,
 * stakeholder rollup) are admin-gated server-side; this file is just
 * typed network glue for the UI.
 */

import type {
  MethodOverrideRow,
  ProjectTypeOverrideFields,
  ProjectTypeOverrideRow,
  StakeholderRollupRow,
} from "@/types/master-data"
import type { ProjectMethod } from "@/types/project-method"
import type { ProjectType } from "@/types/project"

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

// ─── Project-type overrides ───────────────────────────────────────────

export async function listProjectTypeOverrides(): Promise<
  ProjectTypeOverrideRow[]
> {
  const response = await fetch("/api/master-data/project-type-overrides", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { overrides: ProjectTypeOverrideRow[] }
  return body.overrides ?? []
}

export async function saveProjectTypeOverride(
  typeKey: ProjectType,
  overrides: ProjectTypeOverrideFields
): Promise<ProjectTypeOverrideRow> {
  const response = await fetch(
    `/api/master-data/project-type-overrides/${encodeURIComponent(typeKey)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { override: ProjectTypeOverrideRow }
  return body.override
}

export async function deleteProjectTypeOverride(
  typeKey: ProjectType
): Promise<void> {
  const response = await fetch(
    `/api/master-data/project-type-overrides/${encodeURIComponent(typeKey)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Method overrides ─────────────────────────────────────────────────

export async function listMethodOverrides(): Promise<MethodOverrideRow[]> {
  const response = await fetch("/api/master-data/method-overrides", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { overrides: MethodOverrideRow[] }
  return body.overrides ?? []
}

export async function setMethodEnabled(
  methodKey: ProjectMethod,
  enabled: boolean
): Promise<MethodOverrideRow> {
  const response = await fetch(
    `/api/master-data/method-overrides/${encodeURIComponent(methodKey)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { override: MethodOverrideRow }
  return body.override
}

// ─── Stakeholder rollup ───────────────────────────────────────────────

export interface StakeholderRollupOptions {
  active_only?: boolean
  role?: string
  org_unit?: string
  search?: string
}

export async function fetchStakeholderRollup(
  options: StakeholderRollupOptions = {}
): Promise<StakeholderRollupRow[]> {
  const params = new URLSearchParams()
  if (options.active_only) params.set("active_only", "true")
  if (options.role) params.set("role", options.role)
  if (options.org_unit) params.set("org_unit", options.org_unit)
  if (options.search) params.set("search", options.search)
  const qs = params.toString()
  const url = qs
    ? `/api/master-data/stakeholders?${qs}`
    : "/api/master-data/stakeholders"
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { rows: StakeholderRollupRow[] }
  return body.rows ?? []
}

export function stakeholderCsvUrl(
  options: StakeholderRollupOptions = {}
): string {
  const params = new URLSearchParams()
  if (options.active_only) params.set("active_only", "true")
  if (options.role) params.set("role", options.role)
  if (options.org_unit) params.set("org_unit", options.org_unit)
  if (options.search) params.set("search", options.search)
  params.set("format", "csv")
  return `/api/master-data/stakeholders?${params}`
}
