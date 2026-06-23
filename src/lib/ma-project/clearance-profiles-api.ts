/**
 * PROJ-100b — fetch wrappers around the clearance-profile catalog
 * (/api/clearance-profiles) and the project-scoped apply-profile +
 * access-overview surfaces. Consumed by the /frontend slice.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type GrantableLevel = "confidential" | "strict"

export interface ClearanceProfile {
  id: string
  tenant_id: string
  name: string
  description: string | null
  granted_level: GrantableLevel
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AccessOverviewEntry {
  user_id: string
  access_reason: "baseline" | "admin" | "clearance"
  cleared_level: MaConfidentialityLevel | null
  valid_until: string | null
}

export interface AccessOverview {
  object_type: "project" | "phase" | "work_item"
  object_id: string
  confidentiality_level: MaConfidentialityLevel
  entries: AccessOverviewEntry[]
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(
  response: Response
): Promise<{ message: string; code?: string }> {
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

export async function listClearanceProfiles(): Promise<ClearanceProfile[]> {
  const response = await fetch("/api/clearance-profiles", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error((await safeError(response)).message)
  const json = (await response.json()) as { profiles: ClearanceProfile[] }
  return json.profiles
}

export interface CreateProfilePayload {
  name: string
  description?: string | null
  granted_level: GrantableLevel
  is_active?: boolean
}

export async function createClearanceProfile(
  payload: CreateProfilePayload
): Promise<ClearanceProfile> {
  const response = await fetch("/api/clearance-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error((await safeError(response)).message)
  return ((await response.json()) as { profile: ClearanceProfile }).profile
}

export type UpdateProfilePayload = Partial<CreateProfilePayload>

export async function updateClearanceProfile(
  id: string,
  payload: UpdateProfilePayload
): Promise<ClearanceProfile> {
  const response = await fetch(
    `/api/clearance-profiles/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!response.ok) throw new Error((await safeError(response)).message)
  return ((await response.json()) as { profile: ClearanceProfile }).profile
}

export async function deleteClearanceProfile(id: string): Promise<void> {
  const response = await fetch(
    `/api/clearance-profiles/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  )
  if (!response.ok) throw new Error((await safeError(response)).message)
}

/** Apply a profile to a user on a project (grants the clearance via the RPC). */
export async function applyClearanceProfile(
  projectId: string,
  userId: string,
  profileId: string
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/clearances/apply-profile`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, profile_id: profileId }),
    }
  )
  if (!response.ok) throw new Error((await safeError(response)).message)
}

/** Read-only "who can see this object?" overview (manager-gated server-side). */
export async function fetchAccessOverview(
  projectId: string,
  objectType: "project" | "phase" | "work_item" = "project",
  objectId?: string
): Promise<AccessOverview> {
  const params = new URLSearchParams({ objectType })
  if (objectId) params.set("objectId", objectId)
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/access-overview?${params}`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error((await safeError(response)).message)
  return (await response.json()) as AccessOverview
}
