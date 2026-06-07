/**
 * PROJ-44-β + PROJ-70-γ — context-sources collection endpoint.
 *
 * GET /api/context-sources              — list (optional ?project_id)
 * POST /api/context-sources             — register a new source
 *                                          - application/json: PROJ-44-β
 *                                            text/excerpt path
 *                                          - multipart/form-data:
 *                                            PROJ-70-γ file-upload path
 *                                            (+ δ: .eml/.msg email parse)
 *
 * The γ-multipart path enforces 8 Hardening Acceptance Criteria
 * (AC-γH-1 through AC-γH-8) inside this handler before the parser
 * library is invoked. The δ email branches add AC-δH-1 through
 * AC-δH-6 (multipart-bomb guard, attachments-ignored, CFB try/catch)
 * inside `eml-parser.ts` / `msg-parser.ts`. The Sentry beforeSend filter strips parser
 * output from logs (AC-γH-7); see `src/lib/sentry-config.ts` for
 * the global hook.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"
import { classifyContextSourcePrivacy } from "@/lib/context-sources/classify-privacy"
import {
  FileParseError,
  PARSER_CONSTANTS,
  parseFile,
} from "@/lib/context-ingestion/file-parser"
import { uploadContextSourceFile } from "@/lib/context-ingestion/storage"
import { CONTEXT_SOURCE_KINDS } from "@/types/context-source"

const createSchema = z.object({
  kind: z.enum(
    CONTEXT_SOURCE_KINDS as unknown as readonly [string, ...string[]],
  ),
  title: z.string().trim().min(1).max(500),
  content_excerpt: z
    .string()
    .max(8000, "Auszug darf 8000 Zeichen nicht überschreiten")
    .optional(),
  content_full_url: z.string().url().max(2000).optional(),
  source_metadata: z.record(z.string(), z.unknown()).optional(),
  language: z.enum(["de", "en"]).optional(),
  // Default the privacy_class on the server when the client didn't
  // classify; the DB default is 3 (safe default — keep out of
  // external LLM path).
  privacy_class: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  project_id: z.string().uuid().optional(),
})

const LIST_SELECT =
  "id, tenant_id, project_id, kind, title, content_excerpt, content_full_url, " +
  "source_metadata, language, privacy_class, processing_status, " +
  "last_processed_at, last_failure_reason, " +
  // PROJ-70-ε (AC-ε8 / δ-QA F-2) — the γ file-metadata columns belong in
  // every list/detail response; they were persisted but not selected.
  "original_filename, mime_type, file_size_bytes, " +
  "created_by, created_at, updated_at"

export async function GET(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return apiError("forbidden", "Active workspace could not be resolved.", 403)
  }

  const url = new URL(request.url)
  const projectIdFilter = url.searchParams.get("project_id")

  let query = supabase
    .from("context_sources")
    .select(LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (projectIdFilter) {
    query = query.eq("project_id", projectIdFilter)
  }

  const { data, error } = await query
  if (error) return apiError("internal_error", error.message, 500)

  return NextResponse.json({ context_sources: data ?? [] })
}

export async function POST(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return apiError("forbidden", "Active workspace could not be resolved.", 403)
  }

  // PROJ-70-γ — content-type dispatch. multipart → file upload path;
  // anything else → JSON-text path (backwards-compat with PROJ-44-β).
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    return handleMultipartUpload(request, supabase, tenantId, userId)
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await request.json())
  } catch (err) {
    return apiError(
      "invalid_request",
      err instanceof Error ? err.message : "Invalid body",
      400,
    )
  }

  // PROJ-44-γ — server-side privacy classifier. When the client
  // omits `privacy_class`, infer it from title + excerpt via
  // regex (no LLM call — Class-3 inputs must never leave the
  // stack). The DB column still defaults to 3 so bypassing the
  // classifier cannot mark personal data as Class 1.
  const classification = body.privacy_class
    ? null
    : classifyContextSourcePrivacy({
        title: body.title,
        content_excerpt: body.content_excerpt,
      })
  const resolvedPrivacyClass =
    body.privacy_class ?? classification?.privacy_class ?? 3
  const mergedMetadata: Record<string, unknown> = {
    ...(body.source_metadata ?? {}),
  }
  if (classification) {
    mergedMetadata["proj44_privacy_inference"] = {
      privacy_class: classification.privacy_class,
      matched_patterns: classification.matched_patterns,
    }
  }

  const { data, error } = await supabase
    .from("context_sources")
    .insert({
      tenant_id: tenantId,
      project_id: body.project_id ?? null,
      kind: body.kind,
      title: body.title,
      content_excerpt: body.content_excerpt ?? null,
      content_full_url: body.content_full_url ?? null,
      source_metadata: mergedMetadata,
      language: body.language ?? null,
      privacy_class: resolvedPrivacyClass,
      created_by: userId,
    })
    .select(LIST_SELECT)
    .single()

  if (error) {
    return apiError("internal_error", error.message, 500)
  }

  return NextResponse.json({ context_source: data }, { status: 201 })
}

// ---------------------------------------------------------------------------
// PROJ-70-γ — Multipart upload handler
// ---------------------------------------------------------------------------
//
// Body shape (multipart/form-data):
//   - file        : the binary upload (required)
//   - kind        : context_sources.kind enum (required)
//   - title       : 1..500 chars (required)
//   - project_id  : UUID (optional)
//   - language    : "de" | "en" (optional)
//
// Flow:
//   1. AC-γH-1 — Content-Length pre-check (handled here + at parser layer).
//   2. Read form data → file Buffer.
//   3. parseFile() does AC-γH-2 to AC-γH-5 + AC-γH-4 timeout internally.
//   4. AC-γH-6 — INSERT context_sources FIRST (so we have an id), THEN
//      upload to storage. On storage-upload failure we DELETE the
//      orphan row.
//   5. UPDATE context_sources.content_full_url with the storage pointer.
//
// AC-γH-7 (PII in logs): parser output is referenced via local variables
// only — never logged via console / Sentry breadcrumbs. Caller-provided
// title is a freetext field expected to be Class-1/2 metadata.
//
// AC-γH-8 (lazy/dynamic import): pdfjs-dist + mammoth + file-type are
// loaded inside parseFile() — this route's static import surface stays
// small.

/**
 * PROJ-70-δ — extension-based MIME fallback for files where browsers
 * send an empty `File.type` (.eml/.msg are the common cases; .md on
 * some platforms). Only a HINT — `sniffMagic` re-validates binary
 * formats via magic bytes (AC-γH-5); text formats are verified by
 * their parsers downstream.
 */
function inferMimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".eml")) return "message/rfc822"
  if (lower.endsWith(".msg")) return "application/vnd.ms-outlook"
  if (lower.endsWith(".md")) return "text/markdown"
  if (lower.endsWith(".txt")) return "text/plain"
  return ""
}

const multipartFieldsSchema = z.object({
  kind: z.enum(
    CONTEXT_SOURCE_KINDS as unknown as readonly [string, ...string[]],
  ),
  title: z.string().trim().min(1).max(500),
  project_id: z.string().uuid().optional(),
  language: z.enum(["de", "en"]).optional(),
})

async function handleMultipartUpload(
  request: Request,
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<NextResponse> {
  // AC-γH-1 — pre-parse Content-Length cap (25 MB). Reject before reading
  // the body so a malicious client can't burn server bandwidth.
  const contentLengthHeader = request.headers.get("content-length")
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10)
    if (
      Number.isFinite(contentLength) &&
      contentLength > PARSER_CONSTANTS.MAX_FILE_BYTES + 4096 // 4 KB headroom for multipart overhead
    ) {
      return apiError(
        "payload_too_large",
        `Upload exceeds the ${PARSER_CONSTANTS.MAX_FILE_BYTES}-byte cap.`,
        413,
      )
    }
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    return apiError(
      "invalid_request",
      err instanceof Error ? err.message : "Could not parse multipart body.",
      400,
    )
  }

  const fileEntry = formData.get("file")
  if (!(fileEntry instanceof File)) {
    return apiError(
      "invalid_request",
      "Missing or invalid `file` field in multipart upload.",
      400,
    )
  }

  // Pull and validate scalar fields. Note that `formData.get` returns
  // FormDataEntryValue (string | File); Zod's parse on a plain object
  // works once we coerce.
  const scalars = {
    kind: formData.get("kind"),
    title: formData.get("title"),
    project_id: formData.get("project_id") ?? undefined,
    language: formData.get("language") ?? undefined,
  }
  let fields: z.infer<typeof multipartFieldsSchema>
  try {
    fields = multipartFieldsSchema.parse({
      kind: typeof scalars.kind === "string" ? scalars.kind : undefined,
      title: typeof scalars.title === "string" ? scalars.title : undefined,
      project_id:
        typeof scalars.project_id === "string"
          ? scalars.project_id
          : undefined,
      language:
        typeof scalars.language === "string" ? scalars.language : undefined,
    })
  } catch (err) {
    return apiError(
      "invalid_request",
      err instanceof Error ? err.message : "Invalid multipart fields.",
      400,
    )
  }

  // AC-γH-1 (defense-in-depth) — final size check after read.
  if (fileEntry.size > PARSER_CONSTANTS.MAX_FILE_BYTES) {
    return apiError(
      "payload_too_large",
      `File ${fileEntry.name} (${fileEntry.size} bytes) exceeds the ${PARSER_CONSTANTS.MAX_FILE_BYTES}-byte cap.`,
      413,
    )
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer())

  // PROJ-70-δ — browsers frequently send an empty `File.type` for .eml
  // and .msg (no registered handler). Fall back to an extension-derived
  // hint; the magic-byte sniff inside parseFile stays the authority for
  // binary formats (AC-γH-5).
  const mimeHint = fileEntry.type || inferMimeFromFilename(fileEntry.name)

  // AC-γH-2 to AC-γH-5 + AC-γH-4 (parse with magic-byte sniff + 20s timeout).
  let parseResult: Awaited<ReturnType<typeof parseFile>>
  try {
    parseResult = await parseFile(buffer, mimeHint)
  } catch (err) {
    if (err instanceof FileParseError) {
      const statusByCode: Record<FileParseError["code"], number> = {
        size_exceeded: 413,
        page_limit_exceeded: 422,
        raw_text_cap_exceeded: 422,
        magic_byte_mismatch: 415,
        unsupported_mime: 415,
        parse_timeout: 504,
        parse_failed: 422,
        email_too_many_parts: 422, // PROJ-70-δ AC-δH-2
        msg_parse_failed: 422, // PROJ-70-δ AC-δH-4
      }
      return apiError(err.code, err.message, statusByCode[err.code] ?? 422)
    }
    return apiError(
      "parse_failed",
      err instanceof Error ? err.message : "File could not be parsed.",
      422,
    )
  }

  const excerpt = parseResult.result.excerpt
  const detectedMime = parseResult.mime

  // PROJ-44-γ classifier on the parsed excerpt.
  const classification = classifyContextSourcePrivacy({
    title: fields.title,
    content_excerpt: excerpt,
  })
  const mergedMetadata: Record<string, unknown> = {
    proj70_gamma_parse: {
      raw_length: parseResult.result.raw_length,
      page_count: parseResult.result.page_count,
      truncated: parseResult.result.truncated,
    },
    proj44_privacy_inference: {
      privacy_class: classification.privacy_class,
      matched_patterns: classification.matched_patterns,
    },
  }
  // PROJ-70-δ — email-header extraction (Lock-5: source_metadata JSON,
  // no dedicated table). Threading headers are forward-compat for ε's
  // Stakeholder-Hint matching; no δ consumer.
  if (parseResult.result.email) {
    mergedMetadata["proj70_delta_email"] = parseResult.result.email
  }

  // AC-γH-6 — INSERT FIRST. We need a context_source_id to build the
  // storage path; the row stays without `content_full_url` until the
  // upload succeeds.
  const { data: insertRow, error: insertErr } = await supabase
    .from("context_sources")
    .insert({
      tenant_id: tenantId,
      project_id: fields.project_id ?? null,
      kind: fields.kind,
      title: fields.title,
      content_excerpt: excerpt,
      content_full_url: null,
      source_metadata: mergedMetadata,
      language: fields.language ?? null,
      privacy_class: classification.privacy_class,
      original_filename: fileEntry.name,
      mime_type: detectedMime,
      file_size_bytes: fileEntry.size,
      created_by: userId,
    })
    .select(LIST_SELECT)
    .single()

  if (insertErr || !insertRow) {
    return apiError(
      "internal_error",
      insertErr?.message ?? "Failed to register context source.",
      500,
    )
  }

  // Supabase's typed-`select` with the long LIST_SELECT string can't
  // infer the row shape, so we narrow via cast.
  const insertedRow = insertRow as unknown as { id: string }
  const insertedId = insertedRow.id

  /** Best-effort row+file cleanup; swallow any cleanup-failure so we
   *  always surface the original error to the caller. */
  const cleanupOrphans = async (storagePath: string | null): Promise<void> => {
    if (storagePath) {
      try {
        await supabase.storage
          .from("context-source-uploads")
          .remove([storagePath])
      } catch {
        // best-effort
      }
    }
    try {
      await supabase.from("context_sources").delete().eq("id", insertedId)
    } catch {
      // best-effort
    }
  }

  // AC-γH-6 — storage upload AFTER successful INSERT. On failure we
  // delete the orphan row to keep the table consistent.
  try {
    const uploadResult = await uploadContextSourceFile({
      supabase,
      tenantId,
      contextSourceId: insertedId,
      buffer,
      mimeType: detectedMime,
      filename: fileEntry.name,
    })

    const { data: updateRow, error: updateErr } = await supabase
      .from("context_sources")
      .update({ content_full_url: uploadResult.pointer })
      .eq("id", insertedId)
      .select(LIST_SELECT)
      .single()
    if (updateErr || !updateRow) {
      // Pointer-update failed but the file is in storage. Try a best-effort
      // cleanup so the row + storage stay aligned.
      await cleanupOrphans(uploadResult.path)
      return apiError(
        "internal_error",
        updateErr?.message ?? "Failed to wire storage pointer.",
        500,
      )
    }
    return NextResponse.json({ context_source: updateRow }, { status: 201 })
  } catch (err) {
    // Roll back the INSERT — no orphan rows.
    await cleanupOrphans(null)
    return apiError(
      "internal_error",
      err instanceof Error ? err.message : "Storage upload failed.",
      500,
    )
  }
}
