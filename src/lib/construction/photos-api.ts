/**
 * PROJ-45-ε — Client-Wrapper der Fotoflächen.
 *
 * Wie die α/β/γ-Wrapper trägt der Fehler seinen **Status** mit: „Datei hängt
 * noch woanders" (403 aus `remove_construction_photo`) muss von einer echten
 * Störung unterscheidbar bleiben, und die Oberfläche darf dafür nie auf den
 * Meldungstext prüfen.
 */

import type {
  ConstructionPhoto,
  ConstructionPhotoCounts,
  ConstructionPhotoSize,
  ConstructionPhotoUploadOutcome,
} from "@/types/construction-photo"

export class ConstructionPhotoApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "ConstructionPhotoApiError"
    this.status = status
    this.code = code
  }
}

export interface PhotoAnchor {
  defect_id?: string
  acceptance_id?: string
  section_id?: string
}

function anchorQuery(anchor: PhotoAnchor): string {
  const p = new URLSearchParams()
  if (anchor.defect_id) p.set("defect_id", anchor.defect_id)
  if (anchor.acceptance_id) p.set("acceptance_id", anchor.acceptance_id)
  if (anchor.section_id) p.set("section_id", anchor.section_id)
  return p.toString()
}

async function fail(res: Response): Promise<never> {
  let code = "request_failed"
  let message = `HTTP ${res.status}`
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string }
    }
    code = body.error?.code ?? code
    message = body.error?.message ?? message
  } catch {
    /* Rumpf war kein JSON — Status trägt die Aussage */
  }
  throw new ConstructionPhotoApiError(res.status, code, message)
}

export async function listConstructionPhotos(
  projectId: string,
  anchor: PhotoAnchor,
): Promise<ConstructionPhoto[]> {
  const res = await fetch(
    `/api/projects/${projectId}/construction-photos?${anchorQuery(anchor)}`,
  )
  if (!res.ok) return fail(res)
  const body = (await res.json()) as { photos: ConstructionPhoto[] }
  return body.photos
}

export async function uploadConstructionPhotos(
  projectId: string,
  anchor: PhotoAnchor,
  files: File[],
  caption?: string,
): Promise<ConstructionPhotoUploadOutcome[]> {
  const fd = new FormData()
  for (const f of files) fd.append("file", f)
  if (anchor.defect_id) fd.append("defect_id", anchor.defect_id)
  if (anchor.acceptance_id) fd.append("acceptance_id", anchor.acceptance_id)
  if (anchor.section_id) fd.append("section_id", anchor.section_id)
  if (caption) fd.append("caption", caption)

  const res = await fetch(`/api/projects/${projectId}/construction-photos`, {
    method: "POST",
    body: fd,
  })
  // 422 ist hier KEIN Fehlschlag der Anfrage, sondern „keine Datei ging durch" —
  // die Ergebnisliste je Datei ist die Aussage (AC-45ε.2).
  if (!res.ok && res.status !== 422) return fail(res)
  const body = (await res.json()) as {
    results?: ConstructionPhotoUploadOutcome[]
  }
  if (!body.results) return fail(res)
  return body.results
}

export interface PhotoMetaPatch {
  caption?: string | null
  taken_on?: string | null
  clear_caption?: boolean
  clear_taken_on?: boolean
  sort_order?: number
}

export async function updateConstructionPhoto(
  projectId: string,
  photoId: string,
  patch: PhotoMetaPatch,
): Promise<ConstructionPhoto> {
  const res = await fetch(
    `/api/projects/${projectId}/construction-photos/${photoId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  )
  if (!res.ok) return fail(res)
  const body = (await res.json()) as { photo: ConstructionPhoto }
  return body.photo
}

/**
 * `deleteFile = false` löst nur die Verknüpfung, `true` legt die Datei
 * zusätzlich in den DMS-Papierkorb. Zwei benannte Wege, kein Ratespiel
 * (AC-45ε.10).
 */
export async function removeConstructionPhoto(
  projectId: string,
  photoId: string,
  deleteFile: boolean,
): Promise<{ unlinked: boolean; file_trashed: boolean }> {
  const q = deleteFile ? "?delete_file=true" : ""
  const res = await fetch(
    `/api/projects/${projectId}/construction-photos/${photoId}${q}`,
    { method: "DELETE" },
  )
  if (!res.ok) return fail(res)
  return (await res.json()) as { unlinked: boolean; file_trashed: boolean }
}

export async function fetchConstructionPhotoCounts(
  projectId: string,
): Promise<ConstructionPhotoCounts> {
  const res = await fetch(
    `/api/projects/${projectId}/construction-photos/counts`,
  )
  if (!res.ok) return fail(res)
  const body = (await res.json()) as { counts: ConstructionPhotoCounts }
  return body.counts
}

/**
 * Adresse der Bytes. Die Galerie lädt `preview`, der Ausdruck `print`, und
 * „Herunterladen" das Original (AC-45ε.9, AC-45ε.13) — nie umgekehrt, sonst
 * zieht eine Galerie mit acht Bildern zig Megabyte.
 */
export function constructionPhotoFileUrl(
  projectId: string,
  photoId: string,
  size: ConstructionPhotoSize,
): string {
  return `/api/projects/${projectId}/construction-photos/${photoId}/file?size=${size}`
}
