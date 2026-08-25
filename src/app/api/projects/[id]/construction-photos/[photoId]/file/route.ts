/**
 * PROJ-45-ε (L33, L35, AC-45εH-6) — Bytes eines Fotos, inline.
 *
 * Warum eine eigene Route und keine Signed URL: `createDocumentSignedUrl` setzt
 * `download: true`, der Browser speichert die Datei dann statt sie zu zeichnen —
 * für `<img>` und damit für Galerie **und Ausdruck** unbrauchbar (gemessen, im
 * Tech Design festgehalten).
 *
 * Die Berechtigung entscheidet die Datenbank, nicht diese Route: gelesen wird
 * mit dem **Sitzungs-Client**, nie mit dem Dienst-Schlüssel. Die
 * Bucket-Policy löst den Knoten über die Pfadsegmente 1–3 auf und prüft
 * Mandanten- und Projektmitgliedschaft plus Vertraulichkeit
 * (`_dms_object_access`, live gelesen). Ein Nicht-Projektmitglied bekommt
 * deshalb keine Bytes — auch nicht über einen erratenen Weg.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { derivedObjectPath } from "@/lib/construction/photo-image"
import { downloadDocumentFile } from "@/lib/dms/storage"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

import { apiError, idSchema, sizeSchema } from "../../_schema"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id: projectId, photoId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }
  if (!idSchema.safeParse(photoId).success) {
    return apiError("invalid_id", "Malformed photo id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
  )
  if (moduleDenial) return moduleDenial

  const parsedSize = sizeSchema.safeParse(
    new URL(request.url).searchParams.get("size") ?? "preview",
  )
  if (!parsedSize.success) {
    return apiError(
      "validation_error",
      "Größe muss preview, print oder original sein.",
      400,
      "size",
    )
  }
  const size = parsedSize.data

  const { data, error } = await supabase
    .from("construction_photos")
    .select(
      "id, project_id, documents!inner(storage_path, mime_type, original_filename, deleted_at)",
    )
    .eq("id", photoId)
    .maybeSingle()
  if (error) return apiError("internal_error", error.message, 500)

  const row = data as
    | {
        project_id: string
        documents: {
          storage_path: string
          mime_type: string | null
          original_filename: string | null
          deleted_at: string | null
        } | null
      }
    | null
  if (
    !row ||
    row.project_id !== projectId ||
    !row.documents ||
    row.documents.deleted_at !== null
  ) {
    return apiError("not_found", "Foto nicht gefunden.", 404)
  }

  const originalPath = row.documents.storage_path
  const path =
    size === "original" ? originalPath : derivedObjectPath(originalPath, size)

  let bytes: Buffer
  try {
    bytes = await downloadDocumentFile(supabase as SupabaseClient, path)
  } catch {
    // Fehlt eine abgeleitete Größe (Altbestand, unterbrochener Upload), gilt das
    // Original als Rückfall. Für das Original selbst gibt es keinen Rückfall.
    if (size === "original") {
      return apiError("not_found", "Datei nicht gefunden.", 404)
    }
    try {
      bytes = await downloadDocumentFile(supabase as SupabaseClient, originalPath)
    } catch {
      return apiError("not_found", "Datei nicht gefunden.", 404)
    }
  }

  const mime =
    size === "original" ? (row.documents.mime_type ?? "image/jpeg") : "image/jpeg"

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
      // Privat: die Antwort hängt an der Sitzung des Aufrufers, ein geteilter
      // Zwischenspeicher darf sie niemandem sonst zeigen.
      "Cache-Control": "private, max-age=60",
      "Content-Disposition":
        size === "original"
          ? `attachment; filename="${(row.documents.original_filename ?? "foto").replace(/["\\\r\n]/g, "_")}"`
          : "inline",
    },
  })
}
