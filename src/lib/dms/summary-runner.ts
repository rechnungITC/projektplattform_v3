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
  /**
   * Überschreibt eine von Hand geänderte Fassung. Standard ist `false`.
   *
   * Die Spec verlangt zweimal, dass eine Handänderung nicht automatisch verloren
   * geht: „save promotes status to `user_edited` and stops further
   * auto-regeneration unless admin force-re-runs" und der Edge-Case „User edits
   * Quintessenz then re-uploads document → previous user edit is preserved
   * unless PM explicitly opts into regeneration".
   *
   * Heute hielte das auch ohne diesen Schalter — aber nur zufällig, aus dem
   * Zusammenspiel dreier Aufrufer: der Upload legt stets ein neues Dokument an,
   * der nächtliche Lauf überspringt jede vorhandene Zeile, und nur der
   * Wiederholen-Knopf trifft eine bestehende. Ein vierter Aufrufer (β mit
   * Überschreiben beim erneuten Hochladen) würde die Handänderung stillschweigend
   * vernichten. Der Schalter macht aus der zufälligen Eigenschaft eine
   * zugesicherte: wer überschreiben will, muss es sagen.
   */
  force?: boolean
}

export interface RunSummaryResult {
  /**
   * `user_edited` heißt: es wurde bewusst NICHTS getan, die Handänderung steht
   * weiter. Ein eigener Wert statt `stale`, weil „ich habe deine Fassung
   * behalten" das Gegenteil von „es ist keine da" ist.
   */
  status: "auto" | "stale" | "user_edited"
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
  const { tenantId, documentId, actorUserId, force = false } = args

  try {
    const supabase = createAdminClient()

    // 0. Handänderung schützen, BEVOR irgendetwas an ein Modell geht. Früh, weil
    //    ein Abbruch danach nicht nur die Fassung retten, sondern auch einen
    //    unnötigen (kostenpflichtigen) Modellaufruf sparen soll.
    if (!force) {
      const { data: current } = await supabase
        .from("document_summaries")
        .select("status")
        .eq("document_id", documentId)
        .maybeSingle()
      if (current?.status === "user_edited") {
        return { status: "user_edited", reason_code: "user_edited_preserved" }
      }
    }

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
        // Zurücksetzen, nicht stehen lassen: der Inhalt ist ab jetzt
        // Maschinenausgabe, und ein Bearbeiter-Stempel auf einem Text, den
        // niemand angefasst hat, wäre schlicht falsch. Dass die Fassung einmal
        // von Hand geändert war, steht im Feld-Audit (`status` und
        // `summary_markdown` sind getrackt) — es geht also nichts verloren.
        edited_by_user_id: null,
        edited_at: null,
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
