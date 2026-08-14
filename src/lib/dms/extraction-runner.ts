/**
 * PROJ-80-α.2 — Persistenz-Seite der Dokument-Extraktion.
 *
 * Getrennt von `extraction.ts`, damit die Parser-/Klassifikations-Logik ohne
 * Datenbank testbar bleibt. Hier liegt nur das Schreiben.
 *
 * **Warum service-role:** `document_extractions` hat bewusst KEINE
 * Schreib-Policy (siehe Migration `20260814100000`). Auszug und Klassifikation
 * entstehen maschinell; ein Client-Schreibweg wäre eine zweite Autorität neben
 * dieser Kette und könnte die Klassifikation umgehen — genau das Loch, das
 * PROJ-80 schließt.
 */

import { createAdminClient } from "@/lib/supabase/admin"

import { extractAndClassify } from "./extraction"

export interface RunExtractionArgs {
  tenantId: string
  documentId: string
  buffer: Buffer
  filename: string
  mimeHint: string
}

export interface RunExtractionResult {
  status: string
  privacy_class: number
}

/**
 * Parst, klassifiziert und schreibt die Auszugs-Zeile für ein Dokument.
 *
 * Idempotent über `document_id` (die Spalte ist UNIQUE): ein erneuter Lauf —
 * etwa nach erneutem Hochladen oder über den Aufräumlauf — ersetzt die Zeile,
 * statt eine zweite anzulegen. Das ist der Grund, warum Text und Klassifikation
 * überhaupt auf derselben Zeile liegen: sie werden **zusammen** ersetzt und
 * können nicht auseinanderlaufen.
 *
 * Wirft nicht. Der Aufrufer läuft im Hintergrund der Antwort (`after()`); eine
 * Ausnahme dort würde niemanden erreichen, aber den Prozess belasten. Fehler
 * landen stattdessen als Zustand in der Zeile — sichtbar statt still.
 */
export async function runDocumentExtraction(
  args: RunExtractionArgs,
): Promise<RunExtractionResult | null> {
  const { tenantId, documentId, buffer, filename, mimeHint } = args

  let outcome
  try {
    outcome = await extractAndClassify(buffer, filename, mimeHint)
  } catch {
    // Unerwarteter Fehler jenseits der bekannten Parser-Codes. Die Zeile wird
    // trotzdem geschrieben, damit das Dokument nicht dauerhaft ohne jede
    // Auszugs-Information dasteht — "wir wissen es nicht" ist eine Aussage,
    // ein fehlender Datensatz ist keine.
    outcome = {
      status: "failed" as const,
      extracted_text: null,
      char_count: null,
      page_count: null,
      parser: null,
      failure_code: "unexpected_error",
      privacy_class: 3 as const,
      full_text_classified_at: null,
      classification_unverified: false,
    }
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from("document_extractions").upsert(
      {
        tenant_id: tenantId,
        document_id: documentId,
        status: outcome.status,
        extracted_text: outcome.extracted_text,
        char_count: outcome.char_count,
        page_count: outcome.page_count,
        parser: outcome.parser,
        failure_code: outcome.failure_code,
        privacy_class: outcome.privacy_class,
        full_text_classified_at: outcome.full_text_classified_at,
        classification_unverified: outcome.classification_unverified,
        extracted_at: new Date().toISOString(),
      },
      { onConflict: "document_id" },
    )
    if (error) return null
  } catch {
    return null
  }

  return { status: outcome.status, privacy_class: outcome.privacy_class }
}
