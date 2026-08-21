/**
 * PROJ-80-α — Quintessenz eines Dokuments lesen und bearbeiten.
 *
 * GET liefert Quintessenz **und** den Auszugs-Zustand. Beides zusammen, weil der
 * Nutzer sonst nicht unterscheiden kann, warum nichts da ist: „noch nicht
 * gelaufen", „Dokument hat keine Textebene", „zu groß" und „kein zulässiger
 * Anbieter" sind vier verschiedene Aussagen mit vier verschiedenen nächsten
 * Schritten.
 *
 * PATCH schreibt die von Hand geänderte Fassung und hebt den Zustand auf
 * `user_edited` — ab dann überschreibt kein automatischer Lauf mehr (Spec:
 * „stops further auto-regeneration").
 *
 * Gelesen wird mit der **Nutzersitzung**, nicht mit service-role: die
 * Vertraulichkeits-Policies aus α.1 hängen an `auth.uid()`. Mit service-role
 * wären sie wirkungslos — genau der Fehler, den CLAUDE.md als „a report RPC
 * called with the service-role key bypasses every RLS gate above it" führt.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  logConfidentialAccess,
  mustBlockOnLogFailure,
  STRICT_LOG_FAILED_MESSAGE,
  summarizeConfidentiality,
} from "@/lib/audit/confidential-read"
import { resolveDocumentInProject } from "@/lib/dms/document-scope"
import { EXTRACTION_SELECT, SUMMARY_SELECT } from "@/lib/dms/summary-select"
import { createAdminClient } from "@/lib/supabase/admin"

const paramsSchema = z.object({
  id: z.string().uuid(),
  docId: z.string().uuid(),
})

const patchSchema = z.object({
  summary_markdown: z.string().min(1).max(50_000),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  const raw = await context.params
  const parsed = paramsSchema.safeParse(raw)
  if (!parsed.success) {
    return apiError("invalid_request", "Ungültige Kennung.", 400)
  }
  const { id: projectId, docId } = parsed.data

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Nicht angemeldet.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  // Das Dokument muss zum Projekt gehören. Ohne diese Prüfung wäre die
  // Projekt-Kennung im Pfad bloß Dekoration und ein Mitglied könnte über ein
  // Projekt, das es sehen darf, ein fremdes Dokument adressieren.
  const scope = await resolveDocumentInProject(
    (table, columns, rowId) =>
      supabase.from(table).select(columns).eq("id", rowId).maybeSingle(),
    projectId,
    docId,
  )
  if (!scope) return apiError("not_found", "Dokument nicht gefunden.", 404)

  // PROJ-130-δ2: Diese Fläche ist In-App-Lesen von Dokument-INHALT — die
  // Quintessenz ist eine Verdichtung des Volltexts. Damit greift die
  // veröffentlichte Stufen-Regel („In-App-Lesen nur bei `strict`"), und zwar
  // hier zwingend: ohne diesen Eintrag könnte man die Essenz eines
  // `strict`-Dokuments lesen, ohne je die protokollierte Download-Route (δ1) zu
  // berühren — genau die Lücke, für die δ2 gebaut wurde. Die Baum-Ansicht ist
  // aus gutem Grund ausgenommen (sie zeigt nur Namen), diese Begründung trägt
  // für Inhalt nicht.
  //
  // `list` ist die In-App-Lese-Fläche des Vokabulars (Aktion `list_read`, vom
  // CHECK erlaubt); `entityId` benennt zusätzlich das genaue Dokument. Bei
  // `standard`/`confidential` entsteht kein Eintrag und kein DB-Aufruf.
  const readLog = await logConfidentialAccess(
    async (fn, args) => await supabase.rpc(fn, args),
    {
      projectId,
      entityType: "documents",
      surface: "list",
      summary: summarizeConfidentiality([
        { confidentiality_level: scope.confidentialityLevel },
      ]),
      entityId: docId,
      detail: { surface: "document_summary" },
    },
  )
  if (mustBlockOnLogFailure(readLog)) {
    return apiError("audit_log_failed", STRICT_LOG_FAILED_MESSAGE, 500)
  }

  const [{ data: summary }, { data: extraction }] = await Promise.all([
    supabase.from("document_summaries").select(SUMMARY_SELECT).eq("document_id", docId).maybeSingle(),
    supabase.from("document_extractions").select(EXTRACTION_SELECT).eq("document_id", docId).maybeSingle(),
  ])

  return NextResponse.json({
    document: {
      id: scope.documentId,
      original_filename: scope.originalFilename,
      mime_type: scope.mimeType,
    },
    summary: summary ?? null,
    extraction: extraction ?? null,
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; docId: string }> },
) {
  const raw = await context.params
  const parsedParams = paramsSchema.safeParse(raw)
  if (!parsedParams.success) {
    return apiError("invalid_request", "Ungültige Kennung.", 400)
  }
  const { id: projectId, docId } = parsedParams.data

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Nicht angemeldet.", 401)

  // Bearbeiten ist eine inhaltliche Änderung am Projekt — Lesen genügt nicht.
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_request", "Ungültiger Rumpf.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("invalid_request", parsed.error.issues[0]?.message ?? "Ungültig.", 400)
  }

  // Ohne diese Prüfung wird das Bearbeitungsrecht am FALSCHEN Projekt geprüft:
  // `requireProjectAccess` oben gilt für das Projekt aus dem Pfad, die Zeile
  // unten wird aber allein über `document_id` geholt, und geschrieben wird mit
  // service-role. Ein Nutzer mit Bearbeitungsrecht in Projekt A könnte damit
  // die Quintessenz eines Dokuments aus Projekt B ändern, in dem er bloß
  // Betrachter ist (die Lese-Policy verlangt nur `is_project_member`).
  // Begründung und Auflösung: `@/lib/dms/document-scope`.
  const scope = await resolveDocumentInProject(
    (table, columns, rowId) =>
      supabase.from(table).select(columns).eq("id", rowId).maybeSingle(),
    projectId,
    docId,
  )
  if (!scope) return apiError("not_found", "Dokument nicht gefunden.", 404)

  const { data: existing } = await supabase
    .from("document_summaries")
    .select("document_id, updated_at, tenant_id")
    .eq("document_id", docId)
    .maybeSingle()
  if (!existing) {
    return apiError("not_found", "Für dieses Dokument gibt es noch keine Quintessenz.", 404)
  }

  // Spec-Edge-Case „zwei PMs bearbeiten gleichzeitig". Pflicht statt optional
  // (PROJ-141-α2-Lehre): ein fehlender Kopf ist ein Client-Fehler, kein Grund
  // die Änderung des anderen stillschweigend zu überschreiben.
  const ifMatch = request.headers.get("if-match")
  if (!ifMatch) {
    return apiError(
      "precondition_required",
      "If-Match mit dem updated_at der Quintessenz ist erforderlich.",
      428,
      "if-match",
    )
  }
  if (ifMatch !== existing.updated_at) {
    return apiError(
      "conflict",
      "Die Quintessenz wurde zwischenzeitlich geändert. Neu laden und Änderung erneut anwenden.",
      409,
      "updated_at",
    )
  }

  // Geschrieben wird mit service-role, gelesen wurde mit der Nutzersitzung.
  //
  // Das ist kein Umgehen des Tors, sondern seine Reihenfolge: `existing` oben
  // kam durch die RLS-Policies des Nutzers — wer die Zeile nicht sehen darf,
  // ist dort schon mit 404 ausgestiegen. `document_summaries` hat aus α.1
  // bewusst KEINE Schreib-Policy (Auszug und Quintessenz entstehen maschinell);
  // ohne diese Trennung liefe das UPDATE ins Leere und meldete fälschlich
  // "nicht gefunden", obwohl der Nutzer alles richtig gemacht hat.
  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from("document_summaries")
    .update({
      summary_markdown: parsed.data.summary_markdown,
      // Ab hier ist die Fassung menschlich verantwortet; automatische Läufe
      // überschreiben sie nicht mehr.
      status: "user_edited",
      edited_by_user_id: userId,
      edited_at: new Date().toISOString(),
    })
    .eq("document_id", docId)
    // Erneut gegen den erwarteten Stand: zwischen Prüfung und Schreiben liegt
    // ein Moment, in dem ein zweiter Bearbeiter zuschlagen kann. Ohne diese
    // Bedingung wäre die If-Match-Prüfung nur beratend.
    .eq("updated_at", ifMatch)
    .select(SUMMARY_SELECT)
    .maybeSingle()

  if (error) return apiError("update_failed", error.message, 500)
  if (!updated) {
    return apiError(
      "conflict",
      "Die Quintessenz wurde zwischenzeitlich geändert. Neu laden und Änderung erneut anwenden.",
      409,
      "updated_at",
    )
  }

  return NextResponse.json({ summary: updated })
}
