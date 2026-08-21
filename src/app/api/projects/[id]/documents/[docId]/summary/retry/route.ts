/**
 * PROJ-80-α — Quintessenz erneut erzeugen.
 *
 * Die Spec verlangt den Knopf für den Fall, dass nichts erzeugt wurde
 * („surfaced in UI with 'Quintessenz nicht erzeugt' + retry button"). Er ist
 * bewusst eine **Nutzerhandlung**: der nächtliche Lauf wiederholt Fehlschläge
 * nicht, weil das Kosten verursacht und immer am selben Fehler scheitert.
 *
 * Erzeugt nur neu — extrahiert NICHT neu. Der Auszug liegt vor und ist
 * klassifiziert; ihn erneut aus der Datei zu ziehen brächte nichts und würde
 * den Datei-Abruf unnötig wiederholen. Wenn der Auszug selbst fehlgeschlagen
 * ist, hilft nur erneutes Hochladen — der Zustand sagt das.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { resolveDocumentInProject } from "@/lib/dms/document-scope"
import { runDocumentSummary } from "@/lib/dms/summary-runner"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: projectId, docId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Ungültige Projekt-Kennung.", 400, "id")
  }
  if (!z.string().uuid().safeParse(docId).success) {
    return apiError("validation_error", "Ungültige Dokument-Kennung.", 400, "docId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Nicht angemeldet.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Zugehörigkeit UND Sichtbarkeit über die Nutzersitzung prüfen, bevor der
  // Lauf mit service-role weitermacht: sonst könnte ein Editor eine Erzeugung
  // für ein Dokument auslösen, das er nicht sehen darf. Gemeinsame Autorität mit
  // `GET`/`PATCH` — `@/lib/dms/document-scope` erklärt, warum die Prüfung nicht
  // je Route kopiert wird.
  const scope = await resolveDocumentInProject(
    (table, columns, rowId) =>
      supabase.from(table).select(columns).eq("id", rowId).maybeSingle(),
    projectId,
    docId,
  )
  if (!scope) return apiError("not_found", "Dokument nicht gefunden.", 404)

  const { data: extraction } = await supabase
    .from("document_extractions")
    .select("status")
    .eq("document_id", docId)
    .maybeSingle()
  if (!extraction) {
    return apiError("not_found", "Für dieses Dokument gibt es noch keinen Textauszug.", 404)
  }
  if (extraction.status !== "extracted") {
    // Ehrlich statt hilfsbereit-falsch: ohne geprüften Volltext kann keine
    // Quintessenz entstehen, und ein erneuter Versuch ändert daran nichts.
    return apiError(
      "conflict",
      `Der Textauszug ist im Zustand "${extraction.status}". Ohne geprüften Volltext kann keine Quintessenz erzeugt werden.`,
      409,
      "extraction_status",
    )
  }

  // Der Skill wird hier nachgesät, solange die Nutzersitzung da ist — der
  // Hintergrundlauf kann die RPC nicht rufen (sie prüft `is_tenant_member`).
  try {
    await supabase.rpc("ensure_summarizer_skill", {
      p_tenant_id: access.project.tenant_id,
    })
  } catch {
    // Best-effort; ohne Skill läuft die Erzeugung ohne Zusatzanweisung.
  }

  // `force`: dies IST die ausdrückliche Nutzerhandlung, die die Spec als
  // Ausnahme vom Schutz der Handänderung vorsieht. Automatische Läufe
  // (Upload, nächtlicher Aufräumlauf) rufen ohne den Schalter und lassen eine
  // von Hand geänderte Fassung damit unangetastet.
  const result = await runDocumentSummary({
    tenantId: access.project.tenant_id,
    documentId: docId,
    actorUserId: userId,
    force: true,
  })

  if (!result) {
    return apiError("generation_failed", "Die Quintessenz konnte nicht erzeugt werden.", 500)
  }

  return NextResponse.json({
    status: result.status,
    reason_code: result.reason_code,
  })
}
