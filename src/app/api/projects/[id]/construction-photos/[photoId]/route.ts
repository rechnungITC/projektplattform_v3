/**
 * PROJ-45-ε — ein einzelnes Foto.
 *
 * PATCH  — Bildunterschrift, Aufnahmedatum, Reihenfolge (AC-45ε.6, AC-45ε.7).
 *          Ausdrückliche Leeren-Schalter, weil „weglassen" **unverändert**
 *          heisst — der in PROJ-122 live aufgetretene Defekt, den β und γ
 *          schon so behandeln.
 * DELETE  — zwei unterscheidbare Wege (AC-45ε.10): `?delete_file=true` legt die
 *          Datei zusätzlich in den DMS-Papierkorb, ohne den Parameter wird nur
 *          die Verknüpfung gelöst.
 *
 * Beide Wege sind strenger als das Erfassen: nur Projektleitung, Bauleitung oder
 * Mandanten-Administration (AC-45ε.17). Die Prüfung lebt in den Funktionen; die
 * Route gatet `view`, damit das Recht **eine** prüfbare Stelle bleibt (D-β9).
 */

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

import {
  NextResponse,
  apiError,
  idSchema,
  rpcError,
  updateMetaSchema,
} from "../_schema"

type SessionClient = Awaited<
  ReturnType<typeof getAuthenticatedUserId>
>["supabase"]

type Guarded =
  | { error: NextResponse; supabase?: undefined }
  | { error?: undefined; supabase: SessionClient }

async function guard(projectId: string, photoId: string): Promise<Guarded> {
  if (!idSchema.safeParse(projectId).success) {
    return { error: apiError("invalid_id", "Malformed project id.", 400) }
  }
  if (!idSchema.safeParse(photoId).success) {
    return { error: apiError("invalid_id", "Malformed photo id.", 400) }
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return { error: access.error }

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
  )
  if (moduleDenial) return { error: moduleDenial }

  // Gehört das Foto zum Projekt in der Adresse? Ohne diese Prüfung wäre die
  // URL dekorativ und eine Änderung könnte über die Adresse eines anderen
  // Projekts landen — derselbe Fund wie in β beim Statuswechsel.
  const { data, error } = await supabase
    .from("construction_photos")
    .select("id, project_id")
    .eq("id", photoId)
    .maybeSingle()
  if (error) return { error: apiError("internal_error", error.message, 500) }
  const row = data as { project_id: string } | null
  if (!row || row.project_id !== projectId) {
    return { error: apiError("not_found", "Foto nicht gefunden.", 404) }
  }

  return { supabase }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id: projectId, photoId } = await params
  const g = await guard(projectId, photoId)
  if (g.error) return g.error
  const { supabase } = g

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = updateMetaSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid payload.",
      422,
      first?.path?.[0]?.toString(),
    )
  }
  const p = parsed.data
  if (
    p.caption === undefined &&
    p.taken_on === undefined &&
    p.sort_order === undefined &&
    !p.clear_caption &&
    !p.clear_taken_on
  ) {
    return apiError("validation_error", "Keine Änderung angegeben.", 422)
  }

  const { data, error } = await supabase.rpc("set_construction_photo_meta", {
    p_photo_id: photoId,
    p_caption: p.caption ?? null,
    p_taken_on: p.taken_on ?? null,
    p_clear_caption: p.clear_caption ?? false,
    p_clear_taken_on: p.clear_taken_on ?? false,
    p_sort_order: p.sort_order ?? null,
  })
  if (error) {
    return rpcError(error.code, error.message ?? "Änderung fehlgeschlagen.")
  }
  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ photo: row })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id: projectId, photoId } = await params
  const g = await guard(projectId, photoId)
  if (g.error) return g.error
  const { supabase } = g

  const deleteFile =
    new URL(request.url).searchParams.get("delete_file") === "true"

  const { data, error } = await supabase.rpc("remove_construction_photo", {
    p_photo_id: photoId,
    p_delete_file: deleteFile,
  })
  if (error) {
    return rpcError(error.code, error.message ?? "Entfernen fehlgeschlagen.")
  }

  // 0 = nur gelöst, 1 = Datei zusätzlich in den Papierkorb. Beide Wege werden
  // benannt, damit die Oberfläche nicht raten muss (AC-45ε.10).
  const filed = Number(Array.isArray(data) ? data[0] : data) === 1
  return NextResponse.json({
    unlinked: true,
    file_trashed: filed,
  })
}
