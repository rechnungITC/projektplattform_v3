/**
 * PROJ-79-α — POST /api/projects/[id]/documents
 *
 * Upload a file into the project document tree (multipart/form-data).
 * Fields: `file` (binary, required), `parent_id` (uuid|null, target folder),
 * `title` (optional display name).
 *
 * Hardening (mirrors PROJ-70 γ): Content-Length pre-check + 50 MB cap (413),
 * magic-byte MIME sniff — never trust Content-Type (415 on spoof/unsupported),
 * per-tenant quota pre-flight via `dms_quota_status` (413), filename dedup,
 * and orphan-safe sequencing (tree node → storage upload → documents row,
 * with rollback of the node + best-effort object removal on failure).
 *
 * Access: lead/editor/admin ("edit").
 */

import { createHash } from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse, after } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { runDocumentPipeline } from "@/lib/dms/pipeline"
import { DmsMimeError, sniffDocumentMime } from "@/lib/dms/mime"
import { uploadFieldsSchema } from "@/lib/dms/schema"
import { dedupeFilename, dedupeName } from "@/lib/dms/slug"
import { deleteDocumentFile, uploadDocumentFile } from "@/lib/dms/storage"
import type { QuotaStatusRow } from "@/types/dms"

const MAX_FILE_BYTES = 52_428_800 // 50 MB — matches documents.size_bytes CHECK

const NODE_SELECT =
  "id, tenant_id, project_id, parent_id, node_type, name, slug, sort_order, " +
  "created_by, created_at, updated_at, deleted_at"
const DOC_SELECT =
  "id, tenant_id, tree_node_id, storage_backend, storage_path, mime_type, " +
  "size_bytes, original_filename, checksum, mime_unsupported_for_rag, " +
  "ai_generated, ai_generated_metadata, created_by, created_at, updated_at, deleted_at"

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error
  const tenantId = access.project.tenant_id

  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.includes("multipart/form-data")) {
    return apiError(
      "unsupported_media_type",
      "Expected multipart/form-data upload.",
      415,
    )
  }

  // Content-Length pre-check (reject before reading the body).
  const clHeader = request.headers.get("content-length")
  if (clHeader) {
    const cl = Number.parseInt(clHeader, 10)
    if (Number.isFinite(cl) && cl > MAX_FILE_BYTES + 4096) {
      return apiError(
        "payload_too_large",
        `Upload exceeds the ${MAX_FILE_BYTES}-byte cap.`,
        413,
      )
    }
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    return apiError(
      "validation_error",
      err instanceof Error ? err.message : "Could not parse multipart body.",
      400,
    )
  }

  const fileEntry = formData.get("file")
  if (!(fileEntry instanceof File)) {
    return apiError("validation_error", "Missing or invalid `file` field.", 400, "file")
  }

  const scalars = {
    parent_id: formData.get("parent_id") ?? undefined,
    title: formData.get("title") ?? undefined,
  }
  const parsedFields = uploadFieldsSchema.safeParse({
    parent_id:
      typeof scalars.parent_id === "string" && scalars.parent_id !== ""
        ? scalars.parent_id
        : undefined,
    title: typeof scalars.title === "string" ? scalars.title : undefined,
  })
  if (!parsedFields.success) {
    const first = parsedFields.error.issues[0]
    return apiError("validation_error", first?.message ?? "Invalid fields.", 400, first?.path?.[0]?.toString())
  }
  const parentId = parsedFields.data.parent_id ?? null

  // Final size check after read.
  if (fileEntry.size > MAX_FILE_BYTES) {
    return apiError(
      "payload_too_large",
      `File ${fileEntry.name} (${fileEntry.size} bytes) exceeds the ${MAX_FILE_BYTES}-byte cap.`,
      413,
    )
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer())

  // Magic-byte sniff — do NOT trust the declared Content-Type.
  let mime: string
  let mimeUnsupportedForRag: boolean
  try {
    const sniff = await sniffDocumentMime(buffer, fileEntry.name)
    mime = sniff.mime
    mimeUnsupportedForRag = sniff.mime_unsupported_for_rag
  } catch (err) {
    if (err instanceof DmsMimeError) {
      return apiError(err.code, err.message, 415)
    }
    return apiError("unsupported_media_type", "File type could not be validated.", 415)
  }

  // Validate the target folder when given.
  if (parentId) {
    const { data: parent, error: parentErr } = await supabase
      .from("document_tree_nodes")
      .select("id, project_id, node_type, deleted_at")
      .eq("id", parentId)
      .maybeSingle()
    if (parentErr) return apiError("internal_error", parentErr.message, 500)
    if (!parent || parent.deleted_at !== null || parent.project_id !== projectId) {
      return apiError("not_found", "Parent folder not found.", 404, "parent_id")
    }
    if (parent.node_type !== "folder") {
      return apiError("validation_error", "Parent must be a folder.", 400, "parent_id")
    }
  }

  // Quota pre-flight (SECURITY DEFINER — readable by any project member).
  const { data: quotaData, error: quotaErr } = await supabase.rpc(
    "dms_quota_status",
    { p_project_id: projectId },
  )
  if (quotaErr) {
    if (quotaErr.code === "42501")
      return apiError("forbidden", quotaErr.message ?? "Not allowed.", 403)
    if (quotaErr.code === "P0002")
      return apiError("not_found", "Project not found.", 404)
    return apiError("internal_error", quotaErr.message ?? "Quota check failed.", 500)
  }
  const quota = (Array.isArray(quotaData) ? quotaData[0] : quotaData) as
    | QuotaStatusRow
    | undefined
  if (quota && quota.current_usage_bytes + fileEntry.size > quota.max_bytes) {
    return NextResponse.json(
      {
        error: {
          code: "quota_exceeded",
          message: "Storage quota exceeded for this workspace.",
        },
        current_usage_bytes: quota.current_usage_bytes,
        max_bytes: quota.max_bytes,
        attempted_bytes: fileEntry.size,
      },
      { status: 413 },
    )
  }

  // Dedup the display name against live siblings in the target folder.
  let sibQuery = supabase
    .from("document_tree_nodes")
    .select("slug")
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .limit(5000)
  sibQuery = parentId ? sibQuery.eq("parent_id", parentId) : sibQuery.is("parent_id", null)
  const { data: siblings, error: sibErr } = await sibQuery
  if (sibErr) return apiError("internal_error", sibErr.message, 500)
  const existingSlugs = (siblings ?? []).map((s) => (s as { slug: string }).slug)

  const title = parsedFields.data.title?.trim()
  const { name, slug } = title
    ? dedupeName(title, existingSlugs)
    : dedupeFilename(fileEntry.name, existingSlugs)

  // (a) INSERT the tree node first — we need its id for the storage path.
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
    .select(NODE_SELECT)
    .single()
  if (nodeErr || !nodeRow) {
    if (nodeErr?.code === "23505") {
      return apiError("conflict", "A document with that name already exists.", 409)
    }
    return apiError("create_failed", nodeErr?.message ?? "Failed to create tree node.", 500)
  }
  const nodeId = (nodeRow as unknown as { id: string }).id

  const cleanupOrphan = async (storagePath: string | null) => {
    if (storagePath) {
      try {
        await deleteDocumentFile(supabase as SupabaseClient, storagePath)
      } catch {
        /* best-effort */
      }
    }
    try {
      await supabase.from("document_tree_nodes").delete().eq("id", nodeId)
    } catch {
      /* best-effort */
    }
  }

  // (b) Upload the file. (c) INSERT the documents row.
  let storagePath: string | null = null
  try {
    const upload = await uploadDocumentFile({
      supabase: supabase as SupabaseClient,
      tenantId,
      projectId,
      nodeId,
      buffer,
      mimeType: mime,
      filename: fileEntry.name,
    })
    storagePath = upload.path

    const checksum = createHash("sha256").update(buffer).digest("hex")
    const { data: docRow, error: docErr } = await supabase
      .from("documents")
      .insert({
        tenant_id: tenantId,
        tree_node_id: nodeId,
        storage_backend: "internal",
        storage_path: upload.path,
        mime_type: mime,
        size_bytes: fileEntry.size,
        original_filename: fileEntry.name,
        checksum,
        mime_unsupported_for_rag: mimeUnsupportedForRag,
        created_by: userId,
      })
      .select(DOC_SELECT)
      .single()
    if (docErr || !docRow) {
      await cleanupOrphan(storagePath)
      return apiError("create_failed", docErr?.message ?? "Failed to record document.", 500)
    }

    // PROJ-80-α — Textauszug, Klassifikation und Quintessenz im Hintergrund der
    // Antwort. Der Upload darf davon nicht abhängen: die Extraktion kann bei
    // großen PDFs Sekunden dauern, und ein Dokument ohne Auszug ist trotzdem ein
    // gültiges Dokument (der Auszug trägt seinen eigenen Zustand).
    //
    // `after()` wirft außerhalb eines Next.js-Request-Scopes — etwa wenn ein
    // Unit-Test den Handler direkt aufruft. Deshalb umschlossen: die Antwort
    // gewinnt immer (PROJ-54-Muster).
    // PROJ-80-α.2c — Summarizer-Skill nachsäen, solange wir noch eine
    // Nutzersitzung haben. Der Hintergrundlauf schreibt mit service-role und
    // kann die RPC nicht selbst rufen: sie prüft `is_tenant_member`, und für
    // service-role ist `auth.uid()` leer. Best-effort — fehlt der Skill, läuft
    // die Erzeugung ohne Zusatzanweisung weiter (Spec: „indexing still runs").
    try {
      await supabase.rpc("ensure_summarizer_skill", { p_tenant_id: tenantId })
    } catch {
      // Kein Grund, den Upload scheitern zu lassen.
    }

    try {
      const docId = (docRow as unknown as { id: string }).id
      after(async () => {
        try {
          await runDocumentPipeline({
            tenantId,
            documentId: docId,
            buffer,
            filename: fileEntry.name,
            mimeHint: mime,
            actorUserId: userId,
          })
        } catch {
          // `runDocumentExtraction` schreibt Fehler als Zustand in die Zeile und
          // wirft nicht. Dieser Fang deckt nur das Unerwartete ab.
        }
      })
    } catch {
      // Kein Request-Scope (Unit-Test). Der nächtliche Aufräumlauf holt die
      // Extraktion nach — deshalb ist das Auslassen hier folgenlos.
    }

    return NextResponse.json({ document: docRow, node: nodeRow }, { status: 201 })
  } catch (err) {
    await cleanupOrphan(storagePath)
    return apiError(
      "internal_error",
      err instanceof Error ? err.message : "Upload failed.",
      500,
    )
  }
}
