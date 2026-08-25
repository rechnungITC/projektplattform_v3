/**
 * PROJ-45-ε — Fotodokumentation, Sammlung.
 *
 * GET  — Fotostrecke eines Ankers (Mangel, Abnahme oder Bauabschnitt), in
 *        gespeicherter Reihenfolge (AC-45ε.6).
 * POST — Mehrfach-Upload ohne Ordnerwahl (AC-45ε.1, AC-45ε.2). Jede Datei wird
 *        einzeln geprüft; eine abgewiesene bricht die übrigen nicht ab.
 *
 * Die Schranken sind die von PROJ-79 (50 MB, Quota, Magic Bytes) und werden hier
 * **nicht** gesenkt (AC-45ε.3). Zusätzlich greift eine Pixelgrenze, weil eine
 * kleine Datei eine riesige Pixelmasse tragen kann (AC-45εH-7).
 *
 * Rechte (AC-45ε.16/.17, β-Regel): **erfassen darf jedes Projektmitglied**,
 * einschliesslich Betrachter — ein Foto ist eine Beobachtung wie ein Mangel.
 * Ändern und Entfernen sind strenger und leben in den Funktionen.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { after } from "next/server"

import { readCaptureDate } from "@/lib/construction/photo-exif"
import {
  PhotoImageError,
  derivedObjectPath,
  probePhoto,
  renderVariant,
} from "@/lib/construction/photo-image"
import { ensurePhotoFolder } from "@/lib/construction/photo-folder"
import {
  fetchDocumentQuota,
  ingestDocumentFile,
  wouldExceedQuota,
} from "@/lib/dms/ingest"
import { DmsMimeError, sniffDocumentMime } from "@/lib/dms/mime"
import { runDocumentPipeline } from "@/lib/dms/pipeline"
import { dedupeFilename } from "@/lib/dms/slug"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import type { ConstructionPhotoUploadOutcome } from "@/types/construction-photo"

import {
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

import {
  NextResponse,
  PHOTO_SELECT,
  anchorSchema,
  apiError,
  idSchema,
} from "./_schema"

/** Wie PROJ-79 — `documents.size_bytes` trägt dieselbe CHECK-Grenze. */
const MAX_FILE_BYTES = 52_428_800
/** Obergrenze je Vorgang, damit ein Formular die Funktion nicht sprengt. */
const MAX_FILES_PER_REQUEST = 20

type AnchorColumn = "defect_id" | "acceptance_id" | "section_id"

function anchorColumn(a: {
  defect_id?: string
  acceptance_id?: string
  section_id?: string
}): { column: AnchorColumn; value: string } {
  if (a.defect_id) return { column: "defect_id", value: a.defect_id }
  if (a.acceptance_id) return { column: "acceptance_id", value: a.acceptance_id }
  return { column: "section_id", value: a.section_id as string }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // AC-45ε.18 — Modul aus: die Fläche antwortet, als gäbe es sie nicht.
  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
  )
  if (moduleDenial) return moduleDenial

  const search = new URL(request.url).searchParams
  const parsedAnchor = anchorSchema.safeParse({
    defect_id: search.get("defect_id") ?? undefined,
    acceptance_id: search.get("acceptance_id") ?? undefined,
    section_id: search.get("section_id") ?? undefined,
  })
  if (!parsedAnchor.success) {
    return apiError(
      "validation_error",
      parsedAnchor.error.issues[0]?.message ?? "Invalid anchor.",
      400,
    )
  }
  const anchor = anchorColumn(parsedAnchor.data)

  const { data, error } = await supabase
    .from("construction_photos")
    .select(PHOTO_SELECT)
    .eq("project_id", projectId)
    .eq(anchor.column, anchor.value)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500)
  if (error) return apiError("internal_error", error.message, 500)

  return NextResponse.json({ photos: shapePhotos(data ?? []) })
}

type PhotoJoinRow = Record<string, unknown> & {
  documents?:
    | {
        original_filename: string | null
        mime_type: string | null
        size_bytes: number | null
        deleted_at: string | null
      }
    | null
}

/**
 * Flacht den Dokument-Join ein. `storage_path` wird **nicht** durchgereicht:
 * die Bytes kommen über die Ausliefer-Route, ein Ablageweg in der Antwort wäre
 * eine Einladung, an der Route vorbei zu signieren.
 */
function shapePhotos(rows: unknown[]) {
  return (rows as PhotoJoinRow[])
    .filter((r) => (r.documents?.deleted_at ?? null) === null)
    .map((r) => {
      const doc = r.documents ?? null
      const { documents: _drop, ...rest } = r
      return {
        ...rest,
        original_filename: doc?.original_filename ?? null,
        mime_type: doc?.mime_type ?? null,
        size_bytes: doc?.size_bytes ?? null,
      }
    })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // β-Regel: erfassen darf jedes Projektmitglied, Betrachter eingeschlossen.
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const tenantId = access.project.tenant_id

  const moduleDenial = await requireModuleActive(
    supabase,
    tenantId,
    "construction",
  )
  if (moduleDenial) return moduleDenial

  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.includes("multipart/form-data")) {
    return apiError(
      "unsupported_media_type",
      "Expected multipart/form-data upload.",
      415,
    )
  }

  const clHeader = request.headers.get("content-length")
  if (clHeader) {
    const cl = Number.parseInt(clHeader, 10)
    if (
      Number.isFinite(cl) &&
      cl > MAX_FILE_BYTES * MAX_FILES_PER_REQUEST + 8192
    ) {
      return apiError(
        "payload_too_large",
        "Upload exceeds the per-request cap.",
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

  const parsedAnchor = anchorSchema.safeParse({
    defect_id: asString(formData.get("defect_id")),
    acceptance_id: asString(formData.get("acceptance_id")),
    section_id: asString(formData.get("section_id")),
  })
  if (!parsedAnchor.success) {
    return apiError(
      "validation_error",
      parsedAnchor.error.issues[0]?.message ?? "Invalid anchor.",
      400,
    )
  }
  const anchor = parsedAnchor.data

  const files = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return apiError("validation_error", "Missing `file` field.", 400, "file")
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return apiError(
      "validation_error",
      `Höchstens ${MAX_FILES_PER_REQUEST} Dateien je Vorgang.`,
      400,
      "file",
    )
  }

  const folder = await ensurePhotoFolder(
    supabase as SupabaseClient,
    tenantId,
    projectId,
    userId,
  ).catch((err: Error) => err)
  if (folder instanceof Error) {
    return apiError("internal_error", folder.message, 500)
  }

  // Quota EINMAL lesen, dann je Datei fortschreiben — sonst zählt eine Serie
  // gegen denselben Ausgangsstand und darf die Grenze gemeinsam überschreiten.
  const quotaLookup = await fetchDocumentQuota(supabase as SupabaseClient, projectId)
  if (quotaLookup.error) {
    const q = quotaLookup.error
    return apiError(q.code, q.message, q.status)
  }
  let quota = quotaLookup.quota
  const caption = asString(formData.get("caption")) ?? null

  const outcomes: ConstructionPhotoUploadOutcome[] = []

  for (const file of files) {
    const outcome = await ingestOnePhoto({
      supabase: supabase as SupabaseClient,
      tenantId,
      projectId,
      userId,
      folderNodeId: folder.nodeId,
      anchor,
      caption,
      file,
      quotaAllows: (bytes) => !wouldExceedQuota(quota, bytes),
    })
    outcomes.push(outcome)
    if (outcome.ok && quota) {
      quota = {
        ...quota,
        current_usage_bytes: quota.current_usage_bytes + file.size,
      }
    }
  }

  const anySuccess = outcomes.some((o) => o.ok)
  return NextResponse.json(
    { results: outcomes },
    { status: anySuccess ? 201 : 422 },
  )
}

function asString(v: FormDataEntryValue | null): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined
}

interface IngestOneArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  userId: string
  folderNodeId: string
  anchor: { defect_id?: string; acceptance_id?: string; section_id?: string }
  caption: string | null
  file: File
  quotaAllows: (bytes: number) => boolean
}

/**
 * Eine Datei. Gibt **immer** ein Ergebnis zurück und wirft nicht — AC-45ε.2
 * verlangt, dass eine abgewiesene Datei die übrigen nicht abbricht.
 */
async function ingestOnePhoto(
  args: IngestOneArgs,
): Promise<ConstructionPhotoUploadOutcome> {
  const { file, supabase, projectId } = args
  const fail = (code: string, message: string) => ({
    filename: file.name,
    ok: false as const,
    code,
    message,
  })

  if (file.size > MAX_FILE_BYTES) {
    return fail(
      "payload_too_large",
      `${file.name} (${file.size} Byte) überschreitet die Grenze von ${MAX_FILE_BYTES} Byte.`,
    )
  }
  if (!args.quotaAllows(file.size)) {
    return fail("quota_exceeded", "Der Speicherplatz des Mandanten ist erschöpft.")
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // AC-45εH-8 — Magic Bytes VOR allem anderen. Eine als `.jpg` benannte
  // Textdatei fällt hier, nicht erst beim Verkleinern.
  let mime: string
  let mimeUnsupportedForRag: boolean
  try {
    const sniff = await sniffDocumentMime(buffer, file.name)
    mime = sniff.mime
    mimeUnsupportedForRag = sniff.mime_unsupported_for_rag
  } catch (err) {
    if (err instanceof DmsMimeError) return fail(err.code, err.message)
    return fail("unsupported_media_type", "Dateityp konnte nicht geprüft werden.")
  }
  if (mime !== "image/jpeg" && mime !== "image/png") {
    return fail(
      "unsupported_media_type",
      `${file.name} ist kein Bild (erkannt: ${mime}). Zulässig sind JPEG und PNG.`,
    )
  }

  // AC-45εH-7 — Pixelgrenze vor dem Entpacken; liest nur den Bildkopf.
  let probe
  try {
    probe = await probePhoto(buffer)
  } catch (err) {
    if (err instanceof PhotoImageError) return fail(err.code, err.message)
    return fail("unreadable", "Bild konnte nicht gelesen werden.")
  }

  // L36 — ausschliesslich die Aufnahmezeit; alles andere wird verworfen.
  const takenOn = readCaptureDate(probe.exif)

  const { data: siblings } = await supabase
    .from("document_tree_nodes")
    .select("slug")
    .eq("project_id", projectId)
    .eq("parent_id", args.folderNodeId)
    .is("deleted_at", null)
    .limit(5000)
  const existingSlugs = ((siblings ?? []) as { slug: string }[]).map((s) => s.slug)
  const { name, slug } = dedupeFilename(file.name, existingSlugs)

  const ingest = await ingestDocumentFile({
    supabase,
    tenantId: args.tenantId,
    projectId,
    parentId: args.folderNodeId,
    name,
    slug,
    buffer,
    mime,
    mimeUnsupportedForRag,
    filename: file.name,
    sizeBytes: file.size,
    userId: args.userId,
    // L35 / AC-45εH-17 — abgeleitete Größen sind Geschwister-Objekte OHNE
    // eigene `documents`-Zeile: die Quota-Buchhaltung addiert je Zeile
    // (`_dms_bump_storage_usage` auf INSERT, live gemessen), drei Zeilen wären
    // dreifache Zählung und drei Einträge im Dokumentenbaum.
    deriveObjects: async (originalPath) => {
      const [preview, print] = await Promise.all([
        renderVariant(buffer, "preview"),
        renderVariant(buffer, "print"),
      ])
      return [
        {
          path: derivedObjectPath(originalPath, "preview"),
          buffer: preview,
          contentType: "image/jpeg",
        },
        {
          path: derivedObjectPath(originalPath, "print"),
          buffer: print,
          contentType: "image/jpeg",
        },
      ]
    },
  })
  if (!ingest.ok) {
    return fail(ingest.code, ingest.message)
  }

  const { data: photoRow, error: linkErr } = await supabase.rpc(
    "link_construction_photo",
    {
      p_project_id: projectId,
      p_document_id: ingest.documentId,
      p_defect_id: args.anchor.defect_id ?? null,
      p_acceptance_id: args.anchor.acceptance_id ?? null,
      p_section_id: args.anchor.section_id ?? null,
      p_caption: args.caption,
      p_taken_on: takenOn,
    },
  )
  if (linkErr) {
    // Die Verknüpfung ist der Zweck des Vorgangs. Ohne sie wäre ein Dokument
    // entstanden, das niemand angefordert hat — deshalb zurücknehmen.
    try {
      await supabase.rpc("dms_soft_delete_subtree", { p_node_id: ingest.nodeId })
    } catch {
      /* nach bestem Bemühen */
    }
    return fail(
      linkErr.code ?? "link_failed",
      linkErr.message ?? "Verknüpfung fehlgeschlagen.",
    )
  }

  // PROJ-80 / L38 — die Pipeline überspringt Bilder anhand des Flags und
  // schreibt „kein Textauszug" statt `failed`. Der Anstoß bleibt trotzdem, weil
  // genau dieser ehrliche Zustand entstehen soll (AC-45ε.22).
  try {
    const docId = ingest.documentId
    after(async () => {
      try {
        await runDocumentPipeline({
          tenantId: args.tenantId,
          documentId: docId,
          buffer,
          filename: file.name,
          mimeHint: mime,
          actorUserId: args.userId,
        })
      } catch {
        /* Zustand steht in der Zeile; hier nur das Unerwartete */
      }
    })
  } catch {
    /* kein Request-Scope (Unit-Test) — der nächtliche Lauf holt es nach */
  }

  const row = ((Array.isArray(photoRow) ? photoRow[0] : photoRow) ??
    {}) as Record<string, unknown>
  return {
    filename: file.name,
    ok: true,
    photo: {
      ...row,
      original_filename: file.name,
      mime_type: mime,
      size_bytes: file.size,
    } as ConstructionPhotoUploadOutcome["photo"],
  }
}
