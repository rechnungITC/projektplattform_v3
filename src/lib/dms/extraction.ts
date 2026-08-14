/**
 * PROJ-80-α.2 — Textauszug + Datenschutz-Klassifikation für DMS-Dokumente.
 *
 * Warum es diese Datei gibt: bis PROJ-80 hatte der DMS-Pfad **keine**
 * Datenschutz-Klassifikation. `context_sources` tragen seit PROJ-75 die vollen
 * drei Angaben, Dokumente gar keine. Ein Dokument zusammenzufassen heißt aber,
 * seinen Text an ein Sprachmodell zu geben — ohne Klassifikation gäbe es nichts,
 * woran Invariante #3 greifen könnte, und PROJ-80 wäre der erste Weg im Produkt,
 * der ungeprüften Text nach außen gibt.
 *
 * Der Ablauf spiegelt PROJ-75 wörtlich, statt ein zweites Verfahren zu erfinden:
 * derselbe Parser (`parseFile`), derselbe Klassifizierer über den **Volltext**
 * (nicht den Auszug), dieselbe fail-closed-Haltung.
 */

import {
  FileParseError,
  parseFile,
  type ParseResult,
} from "@/lib/context-ingestion/file-parser"
import { classifyContextSourcePrivacy } from "@/lib/context-sources/classify-privacy"

/** Zustände der Auszugs-Zeile. Spiegelt den CHECK in der Migration. */
export type ExtractionStatus =
  | "pending"
  | "extracted"
  | "failed"
  | "too_large"
  | "unsupported_type"

/**
 * Wie viel Text der Summarizer höchstens zu sehen bekommt.
 *
 * Das ist die **zweite** Obergrenze, getrennt von der geerbten 2-MB-Grenze aus
 * `parseFile`. Die erste entscheidet, ob ein Dokument überhaupt vollständig
 * geprüft werden kann (fail-closed, PROJ-75). Diese hier entscheidet, wie viel
 * davon in eine Modell-Anfrage passt — ein anderer Zweck und deshalb eine
 * andere Zahl.
 *
 * 48.000 Zeichen sind grob 12.000 Token. Bewusst konservativ: bei Class-3-Inhalt
 * ist Ollama der einzige zulässige Weg (Invariante #3), und lokal betriebene
 * Modelle laufen häufig mit 8k-Kontext. Ein großzügigerer Wert würde dort still
 * abgeschnitten — und „still" ist genau das, was PROJ-137 abstellen sollte.
 *
 * **Kein Datenschutz-Loch:** die Klassifikation läuft vorher über den
 * *vollständigen* Text. Die Routing-Entscheidung kennt also das ganze Dokument,
 * auch wenn der Summarizer nur den Anfang sieht.
 */
export const SUMMARY_INPUT_MAX_CHARS = 48_000

export interface ExtractionOutcome {
  status: ExtractionStatus
  extracted_text: string | null
  char_count: number | null
  page_count: number | null
  parser: string | null
  failure_code: string | null
  privacy_class: 1 | 2 | 3
  /** Nur bei `extracted` gesetzt — der CHECK in der DB verlangt das. */
  full_text_classified_at: string | null
  classification_unverified: boolean
}

/**
 * Übersetzt einen Parser-Fehler in den Zeilen-Zustand.
 *
 * Der Unterschied zwischen `too_large` und `failed` ist nicht kosmetisch: „zu
 * groß" ist eine Aussage über die Grenze und hat mit β (Chunking) eine echte
 * Lösung, „kaputt" hat keine. Beides als `failed` zu buchen würde dem Nutzer
 * eine Reparatur nahelegen, die es nicht gibt — und umgekehrt eine echte
 * Fehlfunktion als Größenproblem tarnen.
 */
export function mapParseErrorToStatus(
  code: FileParseError["code"],
): Exclude<ExtractionStatus, "pending" | "extracted"> {
  switch (code) {
    case "size_exceeded":
    case "raw_text_cap_exceeded":
    case "page_limit_exceeded":
      return "too_large"
    case "unsupported_mime":
    case "magic_byte_mismatch":
      return "unsupported_type"
    case "parse_timeout":
    case "parse_failed":
    case "email_too_many_parts":
    case "msg_parse_failed":
      return "failed"
  }
}

/**
 * Kürzt den Text auf das, was eine Modell-Anfrage verträgt, und sagt, ob
 * gekürzt wurde. Der Aufrufer muss das sichtbar machen — eine Kurzfassung, die
 * nur den Anfang gesehen hat, sich aber als Kurzfassung des Ganzen ausgibt,
 * wäre eine stille Unwahrheit.
 */
export function clampForSummary(text: string): {
  text: string
  truncated: boolean
} {
  if (text.length <= SUMMARY_INPUT_MAX_CHARS) {
    return { text, truncated: false }
  }
  return { text: text.slice(0, SUMMARY_INPUT_MAX_CHARS), truncated: true }
}

/**
 * Klassifiziert den **vollständigen** Text (PROJ-75-Regel: nicht den Auszug —
 * PII jenseits der Auszugsgrenze muss erkannt werden).
 *
 * Fällt hier etwas aus, ist das Ergebnis bewusst Klasse 3 statt „unbekannt":
 * die restriktivste Annahme ist die einzige, die nicht leckt.
 */
function classifyFullText(
  filename: string,
  fullText: string,
): { privacy_class: 1 | 2 | 3; unverified: boolean } {
  try {
    const result = classifyContextSourcePrivacy({
      title: filename,
      content_excerpt: fullText,
    })
    return { privacy_class: result.privacy_class, unverified: false }
  } catch {
    return { privacy_class: 3, unverified: true }
  }
}

/**
 * Parst und klassifiziert einen Dokument-Puffer.
 *
 * Reine Funktion über den Puffer — kein Datenbankzugriff, damit sie ohne
 * Supabase testbar ist. Das Schreiben der Zeile macht der Aufrufer.
 */
export async function extractAndClassify(
  buffer: Buffer,
  filename: string,
  mimeHint: string,
): Promise<ExtractionOutcome> {
  let parsed: { result: ParseResult; mime: string }
  try {
    parsed = await parseFile(buffer, mimeHint)
  } catch (err) {
    if (err instanceof FileParseError) {
      return {
        status: mapParseErrorToStatus(err.code),
        extracted_text: null,
        char_count: null,
        page_count: null,
        parser: null,
        failure_code: err.code,
        // Kein Text gelesen -> keine Aussage möglich -> restriktivste Annahme.
        privacy_class: 3,
        full_text_classified_at: null,
        classification_unverified: false,
      }
    }
    throw err
  }

  const fullText = parsed.result.full_text
  // Ein Dokument ohne Textebene (typisch: gescanntes PDF) ist kein Fehler des
  // Parsers. OCR ist ausdrücklich außerhalb (PROJ-71) — deshalb ein eigener,
  // ehrlicher Zustand statt einer leeren "erfolgreichen" Extraktion.
  if (fullText.trim().length === 0) {
    return {
      status: "failed",
      extracted_text: null,
      char_count: 0,
      page_count: parsed.result.page_count,
      parser: parsed.mime,
      failure_code: "no_text_layer",
      privacy_class: 3,
      full_text_classified_at: null,
      classification_unverified: false,
    }
  }

  const classification = classifyFullText(filename, fullText)
  return {
    status: "extracted",
    extracted_text: fullText,
    char_count: fullText.length,
    page_count: parsed.result.page_count,
    parser: parsed.mime,
    failure_code: null,
    privacy_class: classification.privacy_class,
    full_text_classified_at: new Date().toISOString(),
    classification_unverified: classification.unverified,
  }
}
