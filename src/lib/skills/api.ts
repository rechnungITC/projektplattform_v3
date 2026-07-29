/**
 * PROJ-76 — fetch wrappers for the Skill catalog (admin CRUD + PM read).
 */

import type {
  Skill,
  SkillCategory,
  SkillExample,
  SkillFrontmatter,
  SkillKnowledgeLink,
  SkillLinkMode,
  SkillVersion,
} from "@/types/skill"

interface ApiErrorBody {
  error?: { code?: string; message?: string; field?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export async function listSkills(
  includeInactive = false
): Promise<Skill[]> {
  const qs = includeInactive ? "?include_inactive=true" : ""
  const response = await fetch(`/api/skills${qs}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { skills: Skill[] }
  return body.skills ?? []
}

export async function getSkill(
  id: string
): Promise<{ skill: Skill; version: SkillVersion | null }> {
  const response = await fetch(`/api/skills/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { skill: Skill; version: SkillVersion | null }
}

export interface CreateSkillInput {
  name: string
  slug: string
  description?: string
  category: SkillCategory
  method_tags?: string[]
  project_type_tags?: string[]
  markdown_body?: string
  frontmatter?: SkillFrontmatter
}

export async function createSkill(
  input: CreateSkillInput
): Promise<{ skill: Skill; version: SkillVersion }> {
  const response = await fetch("/api/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { skill: Skill; version: SkillVersion }
}

export interface UpdateSkillMetadataInput {
  name?: string
  description?: string
  category?: SkillCategory
  method_tags?: string[]
  project_type_tags?: string[]
}

export async function updateSkillMetadata(
  id: string,
  input: UpdateSkillMetadataInput
): Promise<Skill> {
  const response = await fetch(`/api/skills/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { skill: Skill }
  return body.skill
}

export async function toggleSkillActive(
  id: string,
  isActive: boolean
): Promise<Skill> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/toggle-active`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { skill: Skill }
  return body.skill
}

export async function listSkillVersions(
  id: string
): Promise<SkillVersion[]> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/versions`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { versions: SkillVersion[] }
  return body.versions ?? []
}

export interface CreateVersionInput {
  markdown_body?: string
  frontmatter?: SkillFrontmatter
  change_summary?: string | null
}

export async function createSkillVersion(
  id: string,
  input: CreateVersionInput
): Promise<SkillVersion> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/versions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { version: SkillVersion }
  return body.version
}

/**
 * PROJ-77-α — edit a draft version in place. Pass `ifMatch` (the version's
 * last-seen `updated_at`) for optimistic concurrency; a stale value → 409.
 */
export async function patchSkillVersion(
  id: string,
  versionId: string,
  input: CreateVersionInput,
  ifMatch?: string
): Promise<SkillVersion> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (ifMatch) headers["If-Match"] = ifMatch
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`,
    { method: "PATCH", headers, body: JSON.stringify(input) }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { version: SkillVersion }
  return body.version
}

export async function activateSkillVersion(
  id: string,
  versionId: string
): Promise<{ skill: Skill; version: SkillVersion }> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/activate`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { skill: Skill; version: SkillVersion }
}

export async function rollbackSkillVersion(
  id: string,
  versionId: string
): Promise<{ skill: Skill; version: SkillVersion }> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/rollback`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { skill: Skill; version: SkillVersion }
}

// PROJ-77-β — skill examples (admin authoring aids).
export interface SkillExampleInput {
  title: string
  input: string
  expected_output: string
  tags?: string[]
  display_order?: number
}

export async function listSkillExamples(id: string): Promise<SkillExample[]> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/examples`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { examples: SkillExample[] }
  return body.examples ?? []
}

export async function createSkillExample(
  id: string,
  input: SkillExampleInput
): Promise<SkillExample> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/examples`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { example: SkillExample }
  return body.example
}

export async function updateSkillExample(
  id: string,
  exampleId: string,
  input: Partial<SkillExampleInput>
): Promise<SkillExample> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/examples/${encodeURIComponent(exampleId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { example: SkillExample }
  return body.example
}

export async function deleteSkillExample(
  id: string,
  exampleId: string
): Promise<void> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/examples/${encodeURIComponent(exampleId)}`,
    { method: "DELETE" }
  )
  if (!response.ok) throw new Error(await safeError(response))
}

// PROJ-77-γ — skill knowledge links (admin; link a skill to a DMS node).
export interface SkillKnowledgeLinkInput {
  document_node_id: string
  include_subtree?: boolean
  link_mode?: SkillLinkMode
}

export async function listSkillKnowledgeLinks(
  id: string
): Promise<SkillKnowledgeLink[]> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/knowledge-links`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { links: SkillKnowledgeLink[] }
  return body.links ?? []
}

export async function createSkillKnowledgeLink(
  id: string,
  input: SkillKnowledgeLinkInput
): Promise<SkillKnowledgeLink> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/knowledge-links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { link: SkillKnowledgeLink }
  return body.link
}

export async function updateSkillKnowledgeLink(
  id: string,
  linkId: string,
  input: { include_subtree?: boolean; link_mode?: SkillLinkMode }
): Promise<SkillKnowledgeLink> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/knowledge-links/${encodeURIComponent(linkId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { link: SkillKnowledgeLink }
  return body.link
}

export async function deleteSkillKnowledgeLink(
  id: string,
  linkId: string
): Promise<void> {
  const response = await fetch(
    `/api/skills/${encodeURIComponent(id)}/knowledge-links/${encodeURIComponent(linkId)}`,
    { method: "DELETE" }
  )
  if (!response.ok) throw new Error(await safeError(response))
}
