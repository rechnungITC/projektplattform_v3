import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

import { edgeBelongsToProject } from "../_project-scope"
import { dependencyConstraintTypes } from "../_schema"

/**
 * Kanten-Endpunkt: DELETE und (seit PROJ-155-β.1) PATCH.
 *
 * `dependencies` trägt seit PROJ-9-Round-2 kein `project_id`; die Kante wird
 * über ihre Kennung unter Mandanten-Sichtbarkeit aufgelöst. RLS
 * (`is_tenant_member(tenant_id)`) ist das autoritative Tor, die
 * Projektzugehörigkeit prüft `edgeBelongsToProject` zusätzlich — siehe dort,
 * warum das trotz RLS nötig ist.
 */

const patchSchema = z
  .object({
    constraint_type: z.enum(dependencyConstraintTypes).optional(),
    // Negative Werte sind fachlich sinnvoll: sie bedeuten Überlappung, der
    // Nachfolger startet vor dem Ende des Vorgängers. Die Spanne entspricht
    // der von `work_item_links` (PROJ-27), damit nicht zwei Grenzen gelten.
    lag_days: z.number().int().min(-2000).max(2000).optional(),
  })
  .refine(
    (v) => v.constraint_type !== undefined || v.lag_days !== undefined,
    // Ohne diese Regel wäre ein leerer Rumpf ein stiller Erfolg, der nichts
    // tut — der Aufrufer bekäme 200 und glaubte, er habe etwas geändert.
    { message: "Nichts zu ändern: weder constraint_type noch lag_days." },
  )

async function resolveEdge(
  projectId: string,
  dependencyId: string,
): Promise<
  | { ok: false; response: ReturnType<typeof apiError> }
  | {
      ok: true
      supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"]
    }
> {
  if (!z.string().uuid().safeParse(projectId).success) {
    return {
      ok: false,
      response: apiError("validation_error", "Invalid project id.", 400, "id"),
    }
  }
  if (!z.string().uuid().safeParse(dependencyId).success) {
    return {
      ok: false,
      response: apiError(
        "validation_error",
        "Invalid dependency id.",
        400,
        "did",
      ),
    }
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return { ok: false, response: apiError("unauthorized", "Not signed in.", 401) }
  }

  const { data: edge, error } = await supabase
    .from("dependencies")
    .select("id, from_type, from_id, to_type, to_id")
    .eq("id", dependencyId)
    .maybeSingle()
  if (error) return { ok: false, response: apiError("internal_error", error.message, 500) }
  // Nicht vorhanden und per RLS verborgen sind bewusst ununterscheidbar.
  if (!edge) {
    return { ok: false, response: apiError("not_found", "Dependency not found.", 404) }
  }

  const scope = await edgeBelongsToProject(supabase, projectId, edge)
  if (scope.error) {
    return { ok: false, response: apiError("internal_error", scope.error, 500) }
  }
  if (!scope.belongs) {
    // Ebenfalls 404, nicht 403: dass die Kante anderswo existiert, geht den
    // Aufrufer dieses Projekts nichts an.
    return { ok: false, response: apiError("not_found", "Dependency not found.", 404) }
  }

  return { ok: true, supabase }
}

/**
 * PATCH /api/projects/[id]/dependencies/[did] — Kantentyp und Abstand ändern.
 *
 * Vor PROJ-155-β.1 gab es diesen Weg nicht: Datenbank und beide POST-Routen
 * konnten alle vier Typen plus `lag_days`, der Gantt schrieb aber hartkodiert
 * `FS`/`0` und die Registerfläche konnte nur lesen und löschen. Ein Typwechsel
 * wäre also Löschen-und-Neuanlegen gewesen — mit neuer `created_at`, neuem
 * `created_by` und zwei Audit-Zeilen statt einer Änderung.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; did: string }> },
) {
  const { id: projectId, did: dependencyId } = await context.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return apiError(
      "validation_error",
      issue?.message ?? "Invalid body.",
      400,
      issue?.path?.[0]?.toString(),
    )
  }

  const resolved = await resolveEdge(projectId, dependencyId)
  if (!resolved.ok) return resolved.response

  const patch: Record<string, unknown> = {}
  if (parsed.data.constraint_type !== undefined) {
    patch.constraint_type = parsed.data.constraint_type
  }
  if (parsed.data.lag_days !== undefined) patch.lag_days = parsed.data.lag_days

  const { data: row, error } = await resolved.supabase
    .from("dependencies")
    .update(patch)
    .eq("id", dependencyId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      // Der eindeutige Index läuft über (from, to, constraint_type) — ein
      // Typwechsel kann also auf eine bereits bestehende Kante desselben
      // Paares treffen. Ohne diesen Zweig läse der Nutzer rohen Indexnamen.
      return apiError(
        "duplicate_dependency",
        "Zwischen diesen beiden Objekten gibt es bereits eine Abhängigkeit dieses Typs.",
        422,
      )
    }
    if (error.code === "23514") {
      const message = error.message ?? ""
      if (message.toLowerCase().includes("cycle")) {
        return apiError(
          "cycle_detected",
          "Diese Verbindung würde einen Kreis schliessen.",
          422,
        )
      }
      return apiError("check_violation", message, 422)
    }
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("update_failed", error.message, 500)
  }
  if (!row) {
    // Die Zeile war vorher sichtbar, das UPDATE traf aber nichts — dann hat
    // RLS auf dem Schreibweg abgelehnt. Als 403 melden statt als stillen
    // Erfolg: ein 200 ohne Wirkung ist die schlechteste Antwort.
    return apiError("forbidden", "Not allowed.", 403)
  }
  return NextResponse.json({ dependency: row })
}

/**
 * DELETE /api/projects/[id]/dependencies/[did]
 *
 * **Gehärtet in PROJ-155-β.1:** vorher löschte diese Route allein nach
 * Kanten-Kennung, ohne zu prüfen, ob die Kante überhaupt zum Projekt in der
 * Adresse gehört. Kein Mandantenleck (RLS greift), aber die Projekt-ID war
 * Dekoration und eine Löschung konnte über die Adresse eines fremden Projekts
 * laufen — dieselbe Klasse, die PROJ-45-β an seinen Mutationswegen fand.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; did: string }> },
) {
  const { id: projectId, did: dependencyId } = await context.params

  const resolved = await resolveEdge(projectId, dependencyId)
  if (!resolved.ok) return resolved.response

  const { error } = await resolved.supabase
    .from("dependencies")
    .delete()
    .eq("id", dependencyId)

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
