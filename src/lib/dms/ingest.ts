/**
 * Gemeinsamer Kern der DMS-Aufnahme — Knoten, Objekt, Dokumentzeile.
 *
 * Herausgelöst in PROJ-45-ε aus `POST /api/projects/[id]/documents` (PROJ-79-α),
 * weil die Foto-Aufnahme dieselbe Reihenfolge und dieselbe Aufräumregel braucht.
 * Eine zweite Kopie wäre genau die zweite Wahrheit, die diese Slice an anderen
 * Stellen beseitigt: das Aufräumen verwaister Knoten und die Quota-Regel dürfen
 * nicht zweimal formuliert sein.
 *
 * Die Reihenfolge ist nicht beliebig und stammt aus PROJ-79-α:
 *   (a) Knoten anlegen — seine Kennung ist Teil des Ablagewegs,
 *   (b) Datei hochladen (danach optionale Ableitungen),
 *   (c) Dokumentzeile schreiben.
 * Scheitert (b) oder (c), wird alles Vorherige zurückgenommen, sonst bleibt ein
 * Knoten ohne Datei oder eine Datei ohne Zeile stehen.
 *
 * Was NICHT hierher gehört: Mehrteil-Zerlegung, Elternprüfung, Namensableitung
 * und die Anstoßung der PROJ-80-Pipeline — die unterscheiden sich je Aufrufer.
 */

import { createHash } from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { QuotaStatusRow } from "@/types/dms"

import {
  deleteDocumentFile,
  uploadDocumentFile,
  uploadObjectAtPath,
} from "./storage"

export const DOCUMENT_INGEST_SELECT =
  "id, tenant_id, tree_node_id, storage_backend, storage_path, mime_type, " +
  "size_bytes, original_filename, checksum, mime_unsupported_for_rag, " +
  "ai_generated, ai_generated_metadata, created_by, created_at, updated_at, deleted_at"

export const NODE_INGEST_SELECT =
  "id, tenant_id, project_id, parent_id, node_type, name, slug, sort_order, " +
  "created_by, created_at, updated_at, deleted_at"

/** Eine abgeleitete Datei, die zusammen mit dem Original entsteht. */
export interface DerivedObject {
  path: string
  buffer: Buffer
  contentType: string
}

export interface IngestFailure {
  ok: false
  code: string
  message: string
  status: number
}

export interface IngestSuccess {
  ok: true
  node: Record<string, unknown>
  document: Record<string, unknown>
  nodeId: string
  documentId: string
  storagePath: string
  /** Wege der abgeleiteten Dateien, in der Reihenfolge ihrer Erzeugung. */
  derivedPaths: string[]
}

export interface IngestDocumentArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  parentId: string | null
  /** Anzeigename und Kennung, bereits gegen Geschwister eindeutig gemacht. */
  name: string
  slug: string
  buffer: Buffer
  /** Gesnifftes Format — NIE der gemeldete Content-Type. */
  mime: string
  mimeUnsupportedForRag: boolean
  filename: string
  sizeBytes: number
  userId: string
  /**
   * Erzeugt zusätzliche Dateien, sobald der Ablageweg des Originals bekannt
   * ist. Wirft sie ab, wird der ganze Vorgang zurückgenommen — eine Galerie
   * ohne Vorschau wäre ein halb angelegtes Foto.
   */
  deriveObjects?: (originalPath: string) => Promise<DerivedObject[]>
}

export async function ingestDocumentFile(
  args: IngestDocumentArgs,
): Promise<IngestSuccess | IngestFailure> {
  const { supabase, tenantId, projectId, parentId, name, slug, userId } = args

  // (a) Knoten zuerst — sein Bezeichner steckt im Ablageweg.
  const { data: nodeRow, error: nodeErr } = await supabase
    .from("document_tree_nodes")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      parent_id: parentId,
      node_type: "document",
      name,
      slug,
      created_by: userId,
    })
    .select(NODE_INGEST_SELECT)
    .single()
  if (nodeErr || !nodeRow) {
    if (nodeErr?.code === "23505") {
      return {
        ok: false,
        code: "conflict",
        message: "A document with that name already exists.",
        status: 409,
      }
    }
    return {
      ok: false,
      code: "create_failed",
      message: nodeErr?.message ?? "Failed to create tree node.",
      status: 500,
    }
  }
  const nodeId = (nodeRow as unknown as { id: string }).id

  const written: string[] = []
  const rollback = async () => {
    for (const path of written) {
      try {
        await deleteDocumentFile(supabase, path)
      } catch {
        /* nach bestem Bemühen — der Knoten muss trotzdem weg */
      }
    }
    try {
      await supabase.from("document_tree_nodes").delete().eq("id", nodeId)
    } catch {
      /* nach bestem Bemühen */
    }
  }

  try {
    // (b) Original, dann Ableitungen.
    const upload = await uploadDocumentFile({
      supabase,
      tenantId,
      projectId,
      nodeId,
      buffer: args.buffer,
      mimeType: args.mime,
      filename: args.filename,
    })
    written.push(upload.path)

    const derivedPaths: string[] = []
    if (args.deriveObjects) {
      const derived = await args.deriveObjects(upload.path)
      for (const obj of derived) {
        await uploadObjectAtPath(supabase, obj.path, obj.buffer, obj.contentType)
        written.push(obj.path)
        derivedPaths.push(obj.path)
      }
    }

    // (c) Dokumentzeile.
    const checksum = createHash("sha256").update(args.buffer).digest("hex")
    const { data: docRow, error: docErr } = await supabase
      .from("documents")
      .insert({
        tenant_id: tenantId,
        tree_node_id: nodeId,
        storage_backend: "internal",
        storage_path: upload.path,
        mime_type: args.mime,
        size_bytes: args.sizeBytes,
        original_filename: args.filename,
        checksum,
        mime_unsupported_for_rag: args.mimeUnsupportedForRag,
        created_by: userId,
      })
      .select(DOCUMENT_INGEST_SELECT)
      .single()
    if (docErr || !docRow) {
      await rollback()
      return {
        ok: false,
        code: "create_failed",
        message: docErr?.message ?? "Failed to record document.",
        status: 500,
      }
    }

    return {
      ok: true,
      node: nodeRow as unknown as Record<string, unknown>,
      document: docRow as unknown as Record<string, unknown>,
      nodeId,
      documentId: (docRow as unknown as { id: string }).id,
      storagePath: upload.path,
      derivedPaths,
    }
  } catch (err) {
    await rollback()
    return {
      ok: false,
      code: "upload_failed",
      message: err instanceof Error ? err.message : "Upload failed.",
      status: 500,
    }
  }
}

export interface QuotaLookup {
  quota: QuotaStatusRow | null
  error?: IngestFailure
}

/**
 * Quota-Vorabprüfung. Eine Autorität für beide Aufnahmewege — die Grenze steht
 * in der Datenbank (`dms_quota_status`), nicht im Code.
 */
export async function fetchDocumentQuota(
  supabase: SupabaseClient,
  projectId: string,
): Promise<QuotaLookup> {
  const { data, error } = await supabase.rpc("dms_quota_status", {
    p_project_id: projectId,
  })
  if (error) {
    if (error.code === "42501") {
      return {
        quota: null,
        error: { ok: false, code: "forbidden", message: error.message ?? "Not allowed.", status: 403 },
      }
    }
    if (error.code === "P0002") {
      return {
        quota: null,
        error: { ok: false, code: "not_found", message: "Project not found.", status: 404 },
      }
    }
    return {
      quota: null,
      error: {
        ok: false,
        code: "internal_error",
        message: error.message ?? "Quota check failed.",
        status: 500,
      },
    }
  }
  const quota = (Array.isArray(data) ? data[0] : data) as QuotaStatusRow | undefined
  return { quota: quota ?? null }
}

export function wouldExceedQuota(
  quota: QuotaStatusRow | null,
  addBytes: number,
): boolean {
  if (!quota) return false
  return quota.current_usage_bytes + addBytes > quota.max_bytes
}
