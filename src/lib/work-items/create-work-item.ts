/**
 * PROJ-144 (D3) — die eine geprüfte Work-Item-Anlage.
 *
 * Herausgelöst aus `POST /api/projects/[id]/work-items`, damit ein zweiter
 * Aufrufer (die Assistant-Freigabe aus PROJ-144) exakt dieselben Prüfungen
 * durchläuft statt sie nachzubauen. Verhalten, Fehlercodes und HTTP-Status
 * sind unverändert übernommen — der Drift-Test der Route fährt weiterhin
 * durch diesen Pfad und bleibt der Wächter.
 *
 * Geprüft wird hier, in dieser Reihenfolge:
 *   1. Existenz/Sichtbarkeit des Projekts (RLS entscheidet)
 *   2. Art passt zur Projektmethode (PROJ-26 Method-Gating)
 *   3. Elternregeln inkl. Erlaubnis für oberste Ebene (PROJ-9/PROJ-36)
 *   4. Einfügen mit den serverseitigen Feldern (tenant_id, project_id, created_by)
 *
 * Der Aufrufer übergibt seinen sitzungsgebundenen Supabase-Client — es gibt
 * hier bewusst keinen Service-Role-Weg, damit RLS in jedem Fall greift.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  ALLOWED_PARENT_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"
import type { ProjectMethod } from "@/types/project-method"

export interface CreateWorkItemFailure {
  code: string
  message: string
  status: number
  field?: string
}

export type CreateWorkItemResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; failure: CreateWorkItemFailure }

/**
 * `input` ist das bereits validierte Ergebnis von `workItemCreateSchema`.
 * Es wird per Spread weitergegeben, damit jedes künftige Schema-Feld
 * automatisch mitfließt (Muster der ursprünglichen Route).
 */
export async function createWorkItemChecked(args: {
  supabase: SupabaseClient
  userId: string
  projectId: string
  input: Record<string, unknown> & { kind: string; parent_id?: string | null }
}): Promise<CreateWorkItemResult> {
  const { supabase, userId, projectId, input } = args

  // Projekt auflösen (tenant_id + Methode). RLS blendet fremde Mandanten aus.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("tenant_id, project_method")
    .eq("id", projectId)
    .maybeSingle()

  if (projErr) {
    return fail("internal_error", projErr.message, 500)
  }
  if (!project) {
    return fail("not_found", "Project not found.", 404)
  }

  const method =
    (project as { project_method?: ProjectMethod | null }).project_method ?? null
  const kind = input.kind as WorkItemKind

  // Methoden-Sichtbarkeit — bei nicht gesetzter Methode ist jede Art erlaubt.
  if (method !== null && !WORK_ITEM_METHOD_VISIBILITY[kind].includes(method)) {
    return fail(
      "method_violation",
      `Kind '${kind}' is not visible in method '${method}'.`,
      422,
      "kind",
    )
  }

  // Elternprüfung (Defense in depth — der DB-Trigger ist die Garantie).
  if (input.parent_id) {
    const { data: parent, error: parentErr } = await supabase
      .from("work_items")
      .select("id, kind, project_id, is_deleted")
      .eq("id", input.parent_id)
      .maybeSingle()

    if (parentErr) return fail("internal_error", parentErr.message, 500)
    if (!parent) return fail("invalid_parent", "Parent not found.", 422, "parent_id")
    if (parent.project_id !== projectId) {
      return fail("invalid_parent", "Parent is not in this project.", 422, "parent_id")
    }
    if (parent.is_deleted) {
      return fail("invalid_parent", "Parent is deleted.", 422, "parent_id")
    }
    if (!ALLOWED_PARENT_KINDS[kind].includes(parent.kind as WorkItemKind)) {
      return fail(
        "invalid_parent_kind",
        `${kind} cannot have a ${parent.kind} parent.`,
        422,
        "parent_id",
      )
    }
  } else if (input.parent_id === null || input.parent_id === undefined) {
    if (!ALLOWED_PARENT_KINDS[kind].includes(null)) {
      return fail("invalid_parent_kind", `${kind} requires a parent.`, 422, "parent_id")
    }
  }

  // Spread-Muster: jedes Schema-Feld fließt automatisch mit. DB-Defaults
  // (status='todo', priority='medium', attributes='{}') greifen bei fehlenden
  // Schlüsseln. Der Drift-Test der Route prüft genau das.
  const insertPayload = {
    ...input,
    tenant_id: (project as { tenant_id: string }).tenant_id,
    project_id: projectId,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("work_items")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "23514") return fail("constraint_violation", error.message, 422)
    if (error.code === "23503") return fail("invalid_reference", error.message, 422)
    if (error.code === "42501") return fail("forbidden", "Not allowed.", 403)
    return fail("create_failed", error.message, 500)
  }

  return { ok: true, row: row as Record<string, unknown> }
}

function fail(
  code: string,
  message: string,
  status: number,
  field?: string,
): { ok: false; failure: CreateWorkItemFailure } {
  return { ok: false, failure: { code, message, status, field } }
}
