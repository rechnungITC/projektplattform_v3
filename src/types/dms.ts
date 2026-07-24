/**
 * PROJ-79-α — DMS Foundation shared types (internal core).
 *
 * Mirrors the prod schema of `document_tree_nodes` + `documents` +
 * `tenant_storage_quotas` + the `dms_quota_status` RPC. α only ever
 * writes `folder`/`document` node types and the `internal` storage
 * backend; the β values (`external_link` / `sharepoint` / `gdrive`)
 * are kept in the unions for forward-compatibility.
 */

export type DmsNodeType = "folder" | "document" | "external_link"
export type DmsStorageBackend = "internal" | "sharepoint" | "gdrive"

export interface DocumentTreeNode {
  id: string
  tenant_id: string
  project_id: string
  parent_id: string | null
  node_type: DmsNodeType
  name: string
  slug: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DmsDocument {
  id: string
  tenant_id: string
  tree_node_id: string
  storage_backend: DmsStorageBackend
  storage_path: string
  mime_type: string
  size_bytes: number
  original_filename: string
  checksum: string
  mime_unsupported_for_rag: boolean
  ai_generated: boolean
  ai_generated_metadata: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Compact document metadata embedded into a tree listing. */
export interface TreeNodeDocumentMeta {
  id: string
  mime_type: string
  size_bytes: number
  original_filename: string
}

/** A tree node with (for `document` nodes) the linked document metadata. */
export interface TreeNodeWithDocument extends DocumentTreeNode {
  document: TreeNodeDocumentMeta | null
}

/**
 * A tree node arranged into a forest for react-arborist. `children` is
 * `null` for document leaves (not expandable) and an array for folders.
 */
export interface TreeForestNode extends TreeNodeWithDocument {
  children: TreeForestNode[] | null
}

/** Raw shape returned by the `dms_quota_status(project)` RPC row. */
export interface QuotaStatusRow {
  max_bytes: number
  current_usage_bytes: number
  soft_warning_pct: number
}

/** Enriched quota status returned by the storage-quota endpoint. */
export interface QuotaStatus extends QuotaStatusRow {
  over_soft_warning: boolean
  pct_used: number
}

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

export interface CreateFolderRequest {
  parent_id?: string | null
  name: string
}

export interface RenameNodeRequest {
  name: string
}

export interface MoveNodeRequest {
  parent_id: string | null
}

export type PatchNodeRequest = RenameNodeRequest | MoveNodeRequest

export interface TreeListResponse {
  nodes: TreeNodeWithDocument[]
}

export interface NodeResponse {
  node: DocumentTreeNode
}

export interface DeleteNodeResponse {
  deleted: number
}

export interface UploadDocumentResponse {
  document: DmsDocument
  node: DocumentTreeNode
}

export interface DownloadResponse {
  url: string
}
