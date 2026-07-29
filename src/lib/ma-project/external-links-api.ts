// PROJ-115 — client wrappers for polymorphic external (VDR) document links.

import type {
  ExternalDocumentLink,
  ExternalLinkEntityType,
} from "@/types/external-link"

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}

async function safeError(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { error?: { message?: string } }
    return b.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export async function listExternalLinks(
  projectId: string,
  entityType: ExternalLinkEntityType,
  entityId: string
): Promise<ExternalDocumentLink[]> {
  const res = await fetch(
    `${p(projectId)}/external-links?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { links: ExternalDocumentLink[] }).links
}

export async function addExternalLink(
  projectId: string,
  payload: {
    entity_type: ExternalLinkEntityType
    entity_id: string
    url: string
    label?: string | null
  }
): Promise<ExternalDocumentLink> {
  const res = await fetch(`${p(projectId)}/external-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { link: ExternalDocumentLink }).link
}

export async function deleteExternalLink(
  projectId: string,
  linkId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/external-links?link_id=${encodeURIComponent(linkId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}
