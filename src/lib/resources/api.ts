/**
 * PROJ-11 — fetch wrappers for resources, allocations, and the
 * cross-project utilization report.
 *
 * Resources are tenant-scoped; allocations are project-scoped via the
 * work item. RLS + module gating happen server-side.
 */

import type {
  Resource,
  ResourceAvailability,
  ResourceKind,
  UtilizationBucket,
  UtilizationCell,
  WorkItemResource,
} from "@/types/resource"

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

// ─── Resources (tenant-scoped pool) ───────────────────────────────────

export interface ResourceListOptions {
  active_only?: boolean
  kind?: ResourceKind
}

export async function listResources(
  options: ResourceListOptions = {}
): Promise<Resource[]> {
  const params = new URLSearchParams()
  if (options.active_only) params.set("active_only", "true")
  if (options.kind) params.set("kind", options.kind)
  const qs = params.toString()
  const url = qs ? `/api/resources?${qs}` : "/api/resources"
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { resources: Resource[] }
  return body.resources ?? []
}

export interface ResourceInput {
  display_name: string
  kind?: ResourceKind
  fte_default?: number
  availability_default?: number
  is_active?: boolean
  source_stakeholder_id?: string | null
  linked_user_id?: string | null
  /**
   * PROJ-54-α — per-resource Tagessatz-Override (admin-only at the API).
   * Both fields must be set together (DB CHECK + Zod refinement); pass
   * `null` for both to clear an existing override.
   */
  daily_rate_override?: number | null
  daily_rate_override_currency?: string | null
}

export async function createResource(
  input: ResourceInput
): Promise<Resource> {
  const response = await fetch("/api/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { resource: Resource }
  return body.resource
}

/**
 * Promote a stakeholder into a resource (or link to an existing one
 * when the stakeholder's `linked_user_id` already maps to a resource).
 */
export async function promoteStakeholderToResource(
  stakeholderId: string
): Promise<{ resource: Resource; created: boolean }> {
  const response = await fetch(
    `/api/stakeholders/${encodeURIComponent(stakeholderId)}/promote-to-resource`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { resource: Resource; created: boolean }
}

export interface UpdateResourceOptions {
  /**
   * PROJ-54-β — Optimistic-Lock token. Pass the loaded row's
   * `updated_at`. On staleness the server returns 409 `stale_record`.
   */
  ifUnmodifiedSince?: string
}

export async function updateResource(
  resourceId: string,
  input: Partial<ResourceInput>,
  options: UpdateResourceOptions = {}
): Promise<Resource> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (options.ifUnmodifiedSince) {
    // BUG-3 fix (2026-05-09): custom `X-If-Unmodified-Since` header
    // bypasses Vercel/Next.js edge-layer RFC-7232 semantics that
    // otherwise return 412 before the route runs. Server reads it as
    // the optimistic-lock token; on conflict it answers 409.
    headers["X-If-Unmodified-Since"] = options.ifUnmodifiedSince
  }
  const response = await fetch(
    `/api/resources/${encodeURIComponent(resourceId)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { resource: Resource }
  return body.resource
}

export async function deleteResource(resourceId: string): Promise<void> {
  const response = await fetch(
    `/api/resources/${encodeURIComponent(resourceId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Resource availabilities (date-segmented FTE overrides) ───────────

export async function listAvailabilities(
  resourceId: string
): Promise<ResourceAvailability[]> {
  const response = await fetch(
    `/api/resources/${encodeURIComponent(resourceId)}/availabilities`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    availabilities: ResourceAvailability[]
  }
  return body.availabilities ?? []
}

export interface AvailabilityInput {
  start_date: string
  end_date: string
  fte: number
  note?: string | null
}

export async function createAvailability(
  resourceId: string,
  input: AvailabilityInput
): Promise<ResourceAvailability> {
  const response = await fetch(
    `/api/resources/${encodeURIComponent(resourceId)}/availabilities`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as {
    availability: ResourceAvailability
  }
  return body.availability
}

export async function deleteAvailability(
  resourceId: string,
  availabilityId: string
): Promise<void> {
  const response = await fetch(
    `/api/resources/${encodeURIComponent(resourceId)}/availabilities/${encodeURIComponent(availabilityId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Work-item allocations ─────────────────────────────────────────────

export async function listWorkItemResources(
  projectId: string,
  workItemId: string
): Promise<WorkItemResource[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/resources`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { allocations: WorkItemResource[] }
  return body.allocations ?? []
}

export interface AllocationInput {
  resource_id: string
  allocation_pct: number
}

export async function createAllocation(
  projectId: string,
  workItemId: string,
  input: AllocationInput
): Promise<WorkItemResource> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/resources`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { allocation: WorkItemResource }
  return body.allocation
}

export async function updateAllocation(
  projectId: string,
  workItemId: string,
  allocationId: string,
  input: Partial<AllocationInput>
): Promise<WorkItemResource> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/resources/${encodeURIComponent(allocationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { allocation: WorkItemResource }
  return body.allocation
}

export async function deleteAllocation(
  projectId: string,
  workItemId: string,
  allocationId: string
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/resources/${encodeURIComponent(allocationId)}`,
    { method: "DELETE" }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

// ─── Utilization report ───────────────────────────────────────────────

export interface UtilizationOptions {
  start: string // YYYY-MM-DD
  end: string
  bucket: UtilizationBucket
}

export async function fetchUtilization(
  options: UtilizationOptions
): Promise<UtilizationCell[]> {
  const params = new URLSearchParams({
    start: options.start,
    end: options.end,
    bucket: options.bucket,
  })
  const response = await fetch(`/api/reports/utilization?${params}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { cells: UtilizationCell[] }
  return body.cells ?? []
}

export function utilizationCsvUrl(options: UtilizationOptions): string {
  const params = new URLSearchParams({
    start: options.start,
    end: options.end,
    bucket: options.bucket,
    format: "csv",
  })
  return `/api/reports/utilization?${params}`
}
