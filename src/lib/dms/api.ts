/**
 * PROJ-79-α — DMS fetch wrappers (client-side). Thin, typed wrappers over the
 * project-scoped DMS API routes. Consumed by the Dokumente tab (tree UI,
 * upload dialog, quota bar).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"
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
  payload: {
    name: string
    parent_id?: string | null
    confidentiality_level?: MaConfidentialityLevel
  },
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

/**
 * PROJ-Y-115c — reclassify a node. Raising a folder cascades down its whole
 * subtree server-side; a downgrade below the parent's level is rejected (409),
 * as is a level the caller has no clearance for (403).
 */
export async function setNodeConfidentiality(
  projectId: string,
  nodeId: string,
  level: MaConfidentialityLevel,
): Promise<DocumentTreeNode> {
  const res = await fetch(
    `${p(projectId)}/tree/nodes/${encodeURIComponent(nodeId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidentiality_level: level }),
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

// ---------------------------------------------------------------------------
// PROJ-80-α — Quintessenz
// ---------------------------------------------------------------------------

export interface DocumentExtractionMeta {
  status: "pending" | "extracted" | "failed" | "too_large" | "unsupported_type"
  char_count: number | null
  page_count: number | null
  failure_code: string | null
  privacy_class: 1 | 2 | 3
  classification_unverified: boolean
  extracted_at: string | null
}

export interface DocumentSummaryRow {
  document_id: string
  structured_summary: Record<string, unknown> | null
  summary_markdown: string | null
  status: "auto" | "user_edited" | "stale"
  reason_code: string | null
  generated_at: string | null
  generated_by_skill_version_id: string | null
  edited_by_user_id: string | null
  edited_at: string | null
  updated_at: string
}

export interface DocumentSummaryResponse {
  // Beide Felder sind in `documents` nullable und werden von der Route
  // unverändert durchgereicht — als `string` deklariert wären sie eine
  // Zusicherung, die der Server nicht einhält.
  document: { id: string; original_filename: string | null; mime_type: string | null }
  summary: DocumentSummaryRow | null
  extraction: DocumentExtractionMeta | null
}

/**
 * Ergebnis eines Erzeugungslaufs. `user_edited` bedeutet „bewusst nichts getan,
 * die Handänderung steht weiter" — über den Wiederholen-Knopf kann es nicht
 * auftreten (der erzwingt), über einen automatischen Lauf schon.
 */
export interface DocumentSummaryRunResult {
  status: "auto" | "stale" | "user_edited"
  reason_code: string | null
}

/**
 * Fehler mit HTTP-Status.
 *
 * Die Oberfläche muss 409 („jemand anders war schneller") von einem echten
 * Fehlschlag unterscheiden können. Auf die Meldung zu prüfen wäre das
 * Anti-Muster, das PROJ-77-α als Followup hinterlassen hat.
 */
export class DmsRequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "DmsRequestError"
    this.status = status
  }
}

export async function fetchDocumentSummary(
  projectId: string,
  documentId: string,
): Promise<DocumentSummaryResponse> {
  const res = await fetch(
    `${p(projectId)}/documents/${encodeURIComponent(documentId)}/summary`,
    { method: "GET", cache: "no-store" },
  )
  if (!res.ok) throw new DmsRequestError(res.status, await safeError(res))
  return (await res.json()) as DocumentSummaryResponse
}

/**
 * Speichert die von Hand geänderte Fassung.
 *
 * `updated_at` reist als `If-Match` mit — der Server verlangt den Kopf (428
 * ohne ihn) und antwortet mit 409, wenn zwischenzeitlich jemand anders
 * gespeichert hat.
 */
export async function saveDocumentSummary(
  projectId: string,
  documentId: string,
  summaryMarkdown: string,
  updatedAt: string,
): Promise<DocumentSummaryRow> {
  const res = await fetch(
    `${p(projectId)}/documents/${encodeURIComponent(documentId)}/summary`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": updatedAt },
      body: JSON.stringify({ summary_markdown: summaryMarkdown }),
    },
  )
  if (!res.ok) throw new DmsRequestError(res.status, await safeError(res))
  return ((await res.json()) as { summary: DocumentSummaryRow }).summary
}

export async function retryDocumentSummary(
  projectId: string,
  documentId: string,
): Promise<DocumentSummaryRunResult> {
  const res = await fetch(
    `${p(projectId)}/documents/${encodeURIComponent(documentId)}/summary/retry`,
    { method: "POST" },
  )
  if (!res.ok) throw new DmsRequestError(res.status, await safeError(res))
  return (await res.json()) as DocumentSummaryRunResult
}
