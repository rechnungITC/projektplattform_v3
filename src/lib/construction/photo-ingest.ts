/**
 * PROJ-Y-45q — die Aufnahme eines Fotos, foto-spezifisch.
 *
 * Warum nicht `dms/ingest.ts`: dessen Einfügewege laufen über den
 * Sitzungs-Client und damit über PROJ-79s Policies, die nur
 * `lead`/`editor`/Admin schreiben lassen. Für Fotos gilt die β-Regel (jedes
 * Projektmitglied, Betrachter eingeschlossen, AC-45ε.16/.17) — der QA-Befund
 * F-1 war genau dieser Widerspruch. Der generische Weg bleibt unverändert:
 * für gewöhnliche Dokumente ist die engere Regel richtig.
 *
 * Die Reihenfolge ist die von PROJ-79 und aus zwei gemessenen Gründen
 * unverändert: `documents_bucket_insert` prüft `_dms_object_access(name)` ohne
 * Waisen-Erlaubnis, ein Hochladen VOR dem Knoten wird also abgewiesen; und die
 * Dokumentzeile zuerst zu schreiben wäre schlechter, weil der Quota-Trigger auf
 * ihrem INSERT feuert und es kein Dekrement gibt (PROJ-Y-45p) — ein
 * fehlgeschlagener Upload würde dauerhaft Speicherplatz kosten.
 *
 * Die Rechte liegen in den drei Datenbankfunktionen, nicht hier. Diese Datei
 * ordnet nur und räumt auf.
 */

import { createHash } from "crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  deleteDocumentFile,
  uploadDocumentFile,
  uploadObjectAtPath,
} from "@/lib/dms/storage"

import { derivedObjectPath, renderVariant } from "./photo-image"

export interface PhotoIngestFailure {
  ok: false
  code: string
  message: string
}

export interface PhotoIngestSuccess {
  ok: true
  folderId: string
  nodeId: string
  documentId: string
  storagePath: string
  derivedPaths: string[]
  document: Record<string, unknown>
}

export interface IngestPhotoArgs {
  supabase: SupabaseClient
  tenantId: string
  projectId: string
  /** Anzeigename und Kennung, bereits gegen Geschwister eindeutig gemacht. */
  name: string
  slug: string
  buffer: Buffer
  /** Gesnifftes Format — NIE der gemeldete Content-Type. */
  mime: string
  mimeUnsupportedForRag: boolean
  filename: string
  sizeBytes: number
}

interface NodeRow {
  folder_id: string
  node_id: string
}

/**
 * Legt Knoten, Datei, abgeleitete Größen und Dokumentzeile an. Scheitert
 * irgendetwas nach dem Knoten, wird alles Vorherige zurückgenommen — sonst
 * bliebe ein Knoten ohne Datei oder eine Datei ohne Zeile stehen.
 */
export async function ingestPhotoFile(
  args: IngestPhotoArgs,
): Promise<PhotoIngestSuccess | PhotoIngestFailure> {
  const { supabase, projectId } = args

  // (a) Knoten im Fotoordner. Der Ordner wird von der Funktion gesetzt, nicht
  // vom Aufrufer gewählt — das ist die Einschränkung, die diesen Weg eng hält.
  const { data: nodeData, error: nodeErr } = await supabase.rpc(
    "create_construction_photo_node",
    { p_project_id: projectId, p_name: args.name, p_slug: args.slug },
  )
  if (nodeErr) {
    return {
      ok: false,
      code: nodeErr.code ?? "create_failed",
      message: nodeErr.message ?? "Knoten konnte nicht angelegt werden.",
    }
  }
  const node = (Array.isArray(nodeData) ? nodeData[0] : nodeData) as
    | NodeRow
    | undefined
  if (!node?.node_id || !node.folder_id) {
    return {
      ok: false,
      code: "create_failed",
      message: "Knoten konnte nicht angelegt werden.",
    }
  }

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
      // Nimmt nur einen HALB angelegten Knoten zurück; alles mit Datei weist die
      // Funktion ab. Für einen zurückzunehmenden Upload ist genau das richtig.
      await supabase.rpc("discard_construction_photo_node", {
        p_node_id: node.node_id,
      })
    } catch {
      /* nach bestem Bemühen */
    }
  }

  try {
    // (b) Original, dann die abgeleiteten Größen als Geschwister.
    // Der Mandant gehört wirklich in den Ablageweg: die Bucket-Policy löst den
    // Knoten über die Segmente 1–3 auf, ein leeres erstes Segment würde
    // abgelehnt. (Erste Fassung hatte hier einen Leerstring mit falscher
    // Begründung — beim Gegenlesen gefunden, vor dem ersten Lauf.)
    const upload = await uploadDocumentFile({
      supabase,
      tenantId: args.tenantId,
      projectId,
      nodeId: node.node_id,
      buffer: args.buffer,
      mimeType: args.mime,
      filename: args.filename,
    })
    written.push(upload.path)

    const [preview, print] = await Promise.all([
      renderVariant(args.buffer, "preview"),
      renderVariant(args.buffer, "print"),
    ])
    const derivedPaths: string[] = []
    for (const [variant, body] of [
      ["preview", preview],
      ["print", print],
    ] as const) {
      const path = derivedObjectPath(upload.path, variant)
      await uploadObjectAtPath(supabase, path, body, "image/jpeg")
      written.push(path)
      derivedPaths.push(path)
    }

    // (c) Dokumentzeile.
    const checksum = createHash("sha256").update(args.buffer).digest("hex")
    const { data: docData, error: docErr } = await supabase.rpc(
      "record_construction_photo_document",
      {
        p_node_id: node.node_id,
        p_storage_path: upload.path,
        p_mime_type: args.mime,
        p_size_bytes: args.sizeBytes,
        p_original_filename: args.filename,
        p_checksum: checksum,
        p_mime_unsupported_for_rag: args.mimeUnsupportedForRag,
      },
    )
    if (docErr) {
      await rollback()
      return {
        ok: false,
        code: docErr.code ?? "create_failed",
        message: docErr.message ?? "Dokumentzeile konnte nicht geschrieben werden.",
      }
    }
    const doc = (Array.isArray(docData) ? docData[0] : docData) as
      | Record<string, unknown>
      | undefined
    if (!doc?.id) {
      await rollback()
      return {
        ok: false,
        code: "create_failed",
        message: "Dokumentzeile konnte nicht geschrieben werden.",
      }
    }

    return {
      ok: true,
      folderId: node.folder_id,
      nodeId: node.node_id,
      documentId: doc.id as string,
      storagePath: upload.path,
      derivedPaths,
      document: doc,
    }
  } catch (err) {
    await rollback()
    return {
      ok: false,
      code: "upload_failed",
      message: err instanceof Error ? err.message : "Upload fehlgeschlagen.",
    }
  }
}
