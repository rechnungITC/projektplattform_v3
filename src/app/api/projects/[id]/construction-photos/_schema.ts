import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError } from "../../../_lib/route-helpers"

export const idSchema = z.string().uuid()

/**
 * Genau ein Anker je Foto (L32). Die Datenbank erzwingt es über eine
 * CHECK-Bedingung; die Route weist es früher und sprechender ab.
 */
export const anchorSchema = z
  .object({
    defect_id: idSchema.optional(),
    acceptance_id: idSchema.optional(),
    section_id: idSchema.optional(),
  })
  .refine(
    (v) =>
      [v.defect_id, v.acceptance_id, v.section_id].filter(Boolean).length === 1,
    {
      message:
        "Genau ein Bezug ist erforderlich: Mangel, Abnahme oder Bauabschnitt.",
    },
  )

export const updateMetaSchema = z
  .object({
    caption: z.string().max(500).nullable().optional(),
    taken_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    clear_caption: z.boolean().optional(),
    clear_taken_on: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
  })
  .refine((v) => !(v.clear_caption && v.caption != null), {
    message: "Bildunterschrift setzen und leeren gleichzeitig ist unzulässig.",
    path: ["clear_caption"],
  })
  .refine((v) => !(v.clear_taken_on && v.taken_on != null), {
    message: "Aufnahmedatum setzen und leeren gleichzeitig ist unzulässig.",
    path: ["clear_taken_on"],
  })

export const sizeSchema = z.enum(["preview", "print", "original"])

/**
 * Die Foto-Spalten plus die aus dem Dokument mitgelesenen Anzeigefelder.
 * Explizite Spaltenliste, damit der Schema-Drift-Wächter greift.
 */
export const PHOTO_SELECT =
  "id, project_id, document_id, defect_id, acceptance_id, section_id, " +
  "caption, taken_on, sort_order, created_by, created_at, " +
  "documents!inner(original_filename, mime_type, size_bytes, storage_path, deleted_at)"

/**
 * Abbildung der RPC-Fehlercodes auf HTTP.
 *
 * `42501` deckt zwei Fälle: fehlende Berechtigung **und** die Absage
 * „Datei hängt noch woanders" aus `remove_construction_photo`. Beide sind für
 * den Aufrufer eine Verweigerung, keine Serverstörung — der Meldungstext
 * unterscheidet, der Code nicht (auf Text wird nie geprüft).
 */
export function photoRpcErrorStatus(code: string | undefined): number {
  switch (code) {
    case "42501":
      return 403
    case "P0002":
      return 404
    case "22023":
      return 422
    case "23514":
    case "23503":
      return 422
    default:
      return 500
  }
}

export function rpcError(code: string | undefined, message: string) {
  const status = photoRpcErrorStatus(code)
  const label =
    status === 403
      ? "forbidden"
      : status === 404
        ? "not_found"
        : status === 422
          ? "validation_error"
          : "internal_error"
  return apiError(label, message, status)
}

export { apiError, NextResponse }
