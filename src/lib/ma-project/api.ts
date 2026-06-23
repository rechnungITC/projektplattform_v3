/**
 * PROJ-94 — fetch wrappers around the /api/projects/[id]/ma-profile surface.
 */

import type {
  DealSide,
  MandateStatus,
  MaProjectProfile,
} from "@/types/ma-project"
import type { MaConfidentialityLevel } from "@/types/confidentiality"

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

/** Returns the profile, or `null` when none exists yet (404). */
export async function fetchMaProfile(
  projectId: string
): Promise<MaProjectProfile | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/ma-profile`,
    { method: "GET", cache: "no-store" }
  )
  if (response.status === 404) return null
  if (!response.ok) {
    const err = await safeError(response)
    throw new Error(err.message)
  }
  const body = (await response.json()) as { profile: MaProjectProfile }
  return body.profile
}

export interface MaProfilePatch {
  deal_side?: DealSide | null
  sponsor_user_id?: string
  deal_rationale?: string | null
  search_profile?: string | null
  exclusion_criteria?: string | null
  investment_frame_amount?: number | null
  investment_frame_currency?: string | null
  investment_frame_note?: string | null
  strategic_document_link?: string | null
  confidentiality_level?: MaConfidentialityLevel
}

export async function updateMaProfile(
  projectId: string,
  patch: MaProfilePatch
): Promise<MaProjectProfile> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/ma-profile`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  )
  if (!response.ok) {
    const err = await safeError(response)
    throw new Error(err.message)
  }
  const body = (await response.json()) as { profile: MaProjectProfile }
  return body.profile
}

export interface MandateResult {
  project_id: string
  mandate_status: MandateStatus
  from_status: MandateStatus
}

export async function transitionMandate(
  projectId: string,
  toStatus: MandateStatus
): Promise<MandateResult> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/ma-profile/mandate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: toStatus }),
    }
  )
  if (!response.ok) {
    const err = await safeError(response)
    throw new Error(err.message)
  }
  const body = (await response.json()) as { mandate: MandateResult }
  return body.mandate
}
