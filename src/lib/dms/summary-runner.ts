/**
 * PROJ-80-α.2c — Erzeugung und Persistenz der Quintessenz.
 *
 * Läuft NACH der Extraktion (`extraction-runner.ts`) und stützt sich auf deren
 * Ergebnis: ohne geprüften Volltext gibt es keine Quintessenz, weil sonst
 * ungeprüfter Text an ein Modell ginge.
 *
 * Schreibt wie die Extraktion über service-role — `document_summaries` hat
 * bewusst keine Schreib-Policy.
 */

import { invokeDocumentSummaryGeneration } from "@/lib/ai/router"
import { createAdminClient } from "@/lib/supabase/admin"

import { clampForSummary } from "./extraction"

export interface RunSummaryArgs {
  tenantId: string
  documentId: string
  /** Wer den Lauf ausgelöst hat — landet in `ki_runs.actor_user_id`. */
  actorUserId: string
}

export interface RunSummaryResult {
  status: "auto" | "stale"
  reason_code: string | null
}

/**
 * Erzeugt die Quintessenz für ein Dokument und schreibt sie.
 *
 * Wirft nicht: der Aufrufer läuft im Hintergrund der Antwort. Jeder Ausgang
 * hinterlässt eine Zeile — auch der erfolglose. Eine fehlende Zeile wäre
 * doppeldeutig („noch nicht gelaufen" oder „ohne Ergebnis gelaufen"), und
 * genau diese Doppeldeutigkeit hat PROJ-137 abgeschafft.
 */
export async function runDocumentSummary(
  args: RunSummaryArgs,
): Promise<RunSummaryResult | null> {
  const { tenantId, documentId, actorUserId } = args

  try {
    const supabase = createAdminClient()

    // 1. Auszug laden. Ohne 'extracted' gibt es nichts zu tun — der Zustand
    //    der Extraktions-Zeile ist bereits die Erklärung für den Nutzer.
    const { data: extraction } = await supabase
      .from("document_extractions")
      .select("status, extracted_text, privacy_class")
      .eq("document_id", documentId)
      .maybeSingle()

    if (!extraction || extraction.status !== "extracted" || !extraction.extracted_text) {
      return null
    }

    // 2. Projekt über den Baumknoten auflösen (`ki_runs.project_id`).
    const { data: doc } = await supabase
      .from("documents")
      .select("original_filename, mime_type, tree_node_id")
      .eq("id", documentId)
      .maybeSingle()
    if (!doc) return null

    const { data: node } = await supabase
      .from("document_tree_nodes")
      .select("project_id")
      .eq("id", doc.tree_node_id)
      .maybeSingle()
    if (!node?.project_id) return null

    // 3. Zusatzanweisung aus der aktiven Fassung des Summarizer-Skills.
    //    Fehlt sie (Skill deaktiviert), läuft die Erzeugung trotzdem — die
    //    Spec verlangt genau das: „indexing still runs".
    const { data: skill } = await supabase
      .from("skills")
      .select("id, is_active, current_version_id")
      .eq("tenant_id", tenantId)
      .eq("slug", "summarizer")
      .maybeSingle()

    let instructions: string | null = null
    let skillVersionId: string | null = null
    if (skill?.is_active && skill.current_version_id) {
      const { data: version } = await supabase
        .from("skill_versions")
        .select("id, markdown_content, status")
        .eq("id", skill.current_version_id)
        .maybeSingle()
      if (version?.status === "active") {
        instructions = version.markdown_content ?? null
        skillVersionId = version.id
      }
    }

    // 4. Erzeugen. Der Text wird auf das gekürzt, was in eine Anfrage passt —
    //    die Klassifikation lief vorher über den VOLLTEXT, hier entsteht also
    //    keine Datenschutz-Lücke.
    const clamped = clampForSummary(extraction.extracted_text)
    const result = await invokeDocumentSummaryGeneration({
      supabase,
      tenantId,
      projectId: node.project_id,
      actorUserId,
      context: {
        document: {
          document_id: documentId,
          filename: doc.original_filename,
          mime_type: doc.mime_type,
          privacy_class: extraction.privacy_class as 1 | 2 | 3,
          text: clamped.text,
          truncated: clamped.truncated,
        },
        skill_instructions: instructions,
      },
    })

    // 5. Schreiben. `null`-Ergebnis (Stub, blockiert, Fehler) wird als 'stale'
    //    mit Grund gebucht, NICHT als Erfolg mit leerem Text.
    const hasSummary = result.summary !== null && result.summary_markdown !== null
    const { error } = await supabase.from("document_summaries").upsert(
      {
        tenant_id: tenantId,
        document_id: documentId,
        structured_summary: result.summary,
        summary_markdown: result.summary_markdown,
        generated_by_skill_version_id: skillVersionId,
        generated_at: new Date().toISOString(),
        status: hasSummary ? "auto" : "stale",
        reason_code: result.reason_code ?? null,
      },
      { onConflict: "document_id" },
    )
    if (error) return null

    return {
      status: hasSummary ? "auto" : "stale",
      reason_code: result.reason_code ?? null,
    }
  } catch {
    return null
  }
}
