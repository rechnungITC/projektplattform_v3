/**
 * PROJ-79-α — Supabase Storage helper for the internal `documents` bucket.
 *
 * Single responsibility: upload/delete/sign files in the private `documents`
 * bucket at the tenant/project/node-prefixed path
 *   `{tenant_id}/{project_id}/{tree_node_id}/{sanitized_filename}`
 * required by the storage.objects RLS policies (seg1 = tenant member,
 * seg2 = project member) from the DMS foundation migration.
 *
 * This is a NEW helper (not a reuse of context-ingestion/storage.ts): the
 * DMS bucket is distinct from `context-source-uploads`, and the path layout
 * carries an extra `project_id` segment.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const BUCKET_ID = "documents"

/**
 * Strip path components and reserved characters from a user-provided
 * filename, keeping the extension. Falls back to `upload.bin`. Defends
 * against `../`-style path traversal even though the storage-path prefix is
 * server-controlled. (Logic mirrors context-ingestion/storage.ts so the two
 * buckets sanitize identically.)
 */
export function sanitizeFilename(input: string): string {
  // Only keep the leaf (drop any path components → traversal defense).
  const leaf = input.split(/[/\\]/).pop() ?? input
  // Allow-list: alphanumerics + dot/hyphen/underscore; everything else
  // (spaces, reserved + control chars) collapses to a single underscore.
  const cleaned = leaf.replace(/[^A-Za-z0-9._-]+/g, "_").trim()
  if (cleaned === "" || cleaned === "." || cleaned === "..") return "upload.bin"
  return cleaned.slice(0, 200)
}

export interface UploadDocumentFileArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  nodeId: string
  buffer: Buffer
  mimeType: string
  filename: string
}

export interface UploadDocumentFileResult {
  /** Full storage-object path (`{tenant}/{project}/{node}/{file}`). */
  path: string
}

/**
 * Upload a document buffer. Called only AFTER the owning `document_tree_nodes`
 * row exists (so we have a node id for the path). On failure the caller
 * deletes the orphan tree node + best-effort removes any partial object.
 */
export async function uploadDocumentFile({
  supabase,
  tenantId,
  projectId,
  nodeId,
  buffer,
  mimeType,
  filename,
}: UploadDocumentFileArgs): Promise<UploadDocumentFileResult> {
  const safe = sanitizeFilename(filename)
  const path = `${tenantId}/${projectId}/${nodeId}/${safe}`

  const { error } = await supabase.storage.from(BUCKET_ID).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
    cacheControl: "private, max-age=0",
  })

  if (error) {
    throw new Error(
      `Failed to upload document file: ${error.message ?? "unknown storage error"}`,
    )
  }

  return { path }
}

/** Best-effort delete of a stored object (orphan cleanup + β retention). */
export async function deleteDocumentFile(
  supabase: SupabaseClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_ID).remove([path])
  if (error) {
    throw new Error(
      `Failed to delete document file: ${error.message ?? "unknown storage error"}`,
    )
  }
}

/**
 * Create a short-lived signed download URL. Runs under the caller's RLS
 * context — the `documents_bucket_select` policy gates by tenant+project
 * membership, so a cross-tenant caller can never sign a URL.
 */
export async function createDocumentSignedUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSec: number,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_ID)
    .createSignedUrl(path, expiresInSec, { download: true })
  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to sign document URL: ${error?.message ?? "unknown storage error"}`,
    )
  }
  return data.signedUrl
}

export const DMS_STORAGE_BUCKET_ID = BUCKET_ID
