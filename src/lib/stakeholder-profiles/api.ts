/**
 * PROJ-33 Phase 33-γ — fetch wrappers for Skill + Big5 profiles.
 */

import type {
  PersonalityProfileInput,
  SkillProfileInput,
  StakeholderProfileBundle,
} from "@/types/stakeholder-profile"

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

const base = (projectId: string, sid: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/stakeholders/${encodeURIComponent(sid)}/profile`

export async function getStakeholderProfile(
  projectId: string,
  sid: string,
): Promise<StakeholderProfileBundle> {
  const response = await fetch(base(projectId, sid), {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { bundle: StakeholderProfileBundle }
  return body.bundle
}

export async function updateSkillProfile(
  projectId: string,
  sid: string,
  input: SkillProfileInput,
): Promise<void> {
  const response = await fetch(`${base(projectId, sid)}/skill`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
}

export async function updatePersonalityProfile(
  projectId: string,
  sid: string,
  input: PersonalityProfileInput,
): Promise<void> {
  const response = await fetch(`${base(projectId, sid)}/personality`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
}
