/**
 * PROJ-79-α — DMS fetch wrappers (client-side). Thin, typed wrappers over the
 * project-scoped DMS API routes. Consumed by the Dokumente tab (tree UI,
 * upload dialog, quota bar).
 */

import type {
  DmsDocument,
  DocumentTreeNode,
  QuotaStatus,
  TreeNodeWithDocument,
} from "@/types/dms"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody & {
      current_usage_bytes?: number
      max_bytes?: number
    }
    if (body.error?.code === "quota_exceeded" && body.max_bytes != null) {
      return "Speicherkontingent des Workspace erschöpft."
    }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}

/** Whole-tree load (`?all=true`) — the client builds the forest. */
export async function fetchDocumentTree(
  projectId: string,
): Promise<TreeNodeWithDocument[]> {
  const res = await fetch(`${p(projectId)}/documents/tree?all=true`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { nodes: TreeNodeWithDocument[] }).nodes
}

export async function createFolder(
  projectId: string,
  payload: { name: string; parent_id?: string | null },
): Promise<DocumentTreeNode> {
  const res = await fetch(`${p(projectId)}/tree/nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { node: DocumentTreeNode }).node
}

export async function renameNode(
  projectId: string,
  nodeId: string,
  name: string,
): Promise<DocumentTreeNode> {
  const res = await fetch(
    `${p(projectId)}/tree/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { node: DocumentTreeNode }).node
}

export async function moveNode(
  projectId: string,
  nodeId: string,
  parentId: string | null,
): Promise<DocumentTreeNode> {
  const res = await fetch(
    `${p(projectId)}/tree/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: parentId }),
    },
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { node: DocumentTreeNode }).node
}

export async function deleteNode(
  projectId: string,
  nodeId: string,
): Promise<number> {
  const res = await fetch(
    `${p(projectId)}/tree/nodes/${encodeURIComponent(nodeId)}`,
    { method: "DELETE" },
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { deleted: number }).deleted
}

export async function uploadDocument(
  projectId: string,
  file: File,
  opts: { parentId?: string | null; title?: string } = {},
): Promise<{ document: DmsDocument; node: DocumentTreeNode }> {
  const fd = new FormData()
  fd.append("file", file)
  if (opts.parentId) fd.append("parent_id", opts.parentId)
  if (opts.title) fd.append("title", opts.title)
  const res = await fetch(`${p(projectId)}/documents`, {
    method: "POST",
    body: fd,
  })
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as { document: DmsDocument; node: DocumentTreeNode }
}

export async function getDownloadUrl(
  projectId: string,
  docId: string,
): Promise<string> {
  const res = await fetch(
    `${p(projectId)}/documents/${encodeURIComponent(docId)}/download`,
    { method: "GET", cache: "no-store" },
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { url: string }).url
}

export async function fetchStorageQuota(
  projectId: string,
): Promise<QuotaStatus> {
  const res = await fetch(`${p(projectId)}/storage-quota`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as QuotaStatus
}
