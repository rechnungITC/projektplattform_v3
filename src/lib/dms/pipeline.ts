/**
 * PROJ-80-α.2c — die Kette Auszug → Quintessenz an einer Stelle.
 *
 * Eigene Datei, damit `extraction-runner` und `summary-runner` sich nicht
 * gegenseitig importieren müssen (Zyklus).
 *
 * Drei Aufrufer teilen sich diese Kette: der Upload (im Hintergrund der
 * Antwort), der Wiederholen-Knopf und der nächtliche Aufräumlauf. Ohne
 * gemeinsame Funktion würden sie auseinanderlaufen — und der Aufräumlauf ist
 * genau der Pfad, den niemand beobachtet.
 */

import { runDocumentExtraction, type RunExtractionArgs } from "./extraction-runner"
import { runDocumentSummary } from "./summary-runner"

export interface PipelineResult {
  extraction_status: string | null
  /**
   * `user_edited` heißt: es lag eine von Hand geänderte Fassung vor und der Lauf
   * hat sie bewusst stehen gelassen. Der Wert ist hier nicht bloß der
   * Vollständigkeit halber — ein automatischer Lauf, der einen Handtext
   * überschreibt, wäre ein Datenverlust, und dieser Rückgabewert ist die Stelle,
   * an der ein Aufrufer das unterscheiden kann.
   */
  summary_status: "auto" | "stale" | "user_edited" | null
}

/**
 * Führt Auszug und Quintessenz nacheinander aus.
 *
 * Die Quintessenz wird nur versucht, wenn der Auszug wirklich `extracted` ist.
 * Das ist keine Optimierung, sondern die Zusicherung: ohne geprüften Volltext
 * geht kein Text an ein Modell.
 */
export async function runDocumentPipeline(
  args: RunExtractionArgs & { actorUserId: string },
): Promise<PipelineResult> {
  const extraction = await runDocumentExtraction(args)
  if (!extraction || extraction.status !== "extracted") {
    return { extraction_status: extraction?.status ?? null, summary_status: null }
  }

  const summary = await runDocumentSummary({
    tenantId: args.tenantId,
    documentId: args.documentId,
    actorUserId: args.actorUserId,
  })
  return {
    extraction_status: extraction.status,
    summary_status: summary?.status ?? null,
  }
}
