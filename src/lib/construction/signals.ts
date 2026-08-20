/**
 * PROJ-45-δ — reine Anzeige-Bibliothek für die bauspezifischen Terminsignale.
 * Keine Ein-/Ausgabe, keine React-Abhängigkeit: Routen, CSV-Ausgabe und die
 * Oberfläche teilen dieselben Formulierungen.
 *
 * ZWEI DINGE, DIE HIER BEWUSST *NICHT* PASSIEREN:
 *
 * 1. Es entsteht kein dritter „offen"-Begriff. β (`isDefectOverdue`) schliesst
 *    `erledigt` AUS, γ (`ACCEPTANCE_OPEN_DEFECT_STATUSES`) schliesst es EIN —
 *    beide zu Recht, aus verschiedenen Gründen. Die Zahlen dieser Slice kommen
 *    fertig aus `construction_schedule_signals`; hier wird keine Statusliste
 *    kopiert und keine Regel nachgebaut.
 * 2. Die manuelle α-Ampel bekommt keine zweite Beschriftungstabelle. Sie ist
 *    ein Alias auf `CONSTRUCTION_RAG_LABELS` — zwei Tabellen für dieselben drei
 *    Werte würden auseinanderlaufen.
 *
 * DER KERN DER DATEI ist {@link describeProgressSource}. Die Auswertung liefert
 * `progress_percent = null`, wenn nichts zählbar verknüpft ist — ohne die
 * Quellenangabe wäre „0 %" nicht von „nichts verknüpft" zu unterscheiden, und
 * „nichts verknüpft" ist in Prod heute der NORMALFALL (das einzige lebende
 * Bauprojekt hat 0 Phasen und 0 Arbeitspakete). Keine der Formulierungen darf
 * daher „alles in Ordnung" suggerieren (AC-45δ.9 / AC-45δ.10).
 */

import { CONSTRUCTION_RAG_LABELS } from "@/types/construction"
import type { ConstructionRagStatus } from "@/types/construction"
import type {
  ConstructionBlockerReason,
  ConstructionDeadlineEntry,
  ConstructionProgressSource,
  ConstructionSectionSignal,
} from "@/types/construction-signals"

// ── Beschriftungen (deutsch — fachliche Oberfläche) ─────────────────────────

/**
 * Warum ein Gewerk als blockiert gilt (L27, AC-45δ.3).
 *
 * TOTALER `Record`: ein künftiger fünfter Grund in
 * `ConstructionBlockerReason` bricht die Übersetzung an dieser Stelle, statt
 * unbeschriftet in die Oberfläche zu rutschen.
 */
export const CONSTRUCTION_BLOCKER_REASON_LABELS: Record<
  ConstructionBlockerReason,
  string
> = {
  overdue_defects: "Überfällige Mängel",
  acceptance_refused: "Abnahme verweigert",
  acceptance_overdue: "Abnahmetermin verstrichen",
  reservations_open: "Offene Vorbehalte",
}

/**
 * Anzeigereihenfolge der Gründe. Aus dem totalen `Record` ABGELEITET, damit die
 * Liste nicht eigenständig von den Beschriftungen wegdriften kann.
 */
export const CONSTRUCTION_BLOCKER_REASONS = Object.keys(
  CONSTRUCTION_BLOCKER_REASON_LABELS
) as ConstructionBlockerReason[]

/**
 * Die manuelle α-Ampel (L26) — steht NEBEN dem gerechneten Signal, nie an
 * dessen Stelle. Alias statt Kopie: `CONSTRUCTION_RAG_LABELS` ist die eine
 * Wahrheit für diese drei Werte.
 */
export const CONSTRUCTION_MANUAL_STATUS_LABELS: Record<
  ConstructionRagStatus,
  string
> = CONSTRUCTION_RAG_LABELS

// ── Quellenangabe des Abschnittsfortschritts ────────────────────────────────

interface SourceNoun {
  /** „3 Arbeitspakete verknüpft" */
  nominativeSingular: string
  nominativePlural: string
  /** „aus 7 Arbeitspaketen" — Dativ Plural; im Singular gleich dem Nominativ. */
  dativePlural: string
}

const SOURCE_NOUNS: Record<ConstructionProgressSource, SourceNoun> = {
  work_items: {
    nominativeSingular: "Arbeitspaket",
    nominativePlural: "Arbeitspakete",
    dativePlural: "Arbeitspaketen",
  },
  phases: {
    nominativeSingular: "Phase",
    nominativePlural: "Phasen",
    dativePlural: "Phasen",
  },
}

const PHASE_NOUN = SOURCE_NOUNS.phases

/** Was die Auswertung von der Anzeige braucht — bewusst schmal gehalten. */
export type ProgressSourceInput = Pick<
  ConstructionSectionSignal,
  "progress_source" | "source_count" | "linked_count" | "phase_linked_count"
>

/**
 * „Verknüpft, aber nichts zählbar": es hängen Vorgänge am Teilbaum, aber alle
 * sind abgebrochen und fallen damit aus dem Nenner (`work_denominator` /
 * `phase_denominator` in der Auswertung). Ein Fortschritt von 0 % wäre hier
 * ebenso irreführend wie bei „nichts verknüpft" — er ist gar nicht definiert.
 */
export function hasCancelledOnlyLinks(
  section: Pick<ConstructionSectionSignal, "source_count" | "linked_count">
): boolean {
  return section.linked_count > 0 && section.source_count === 0
}

/** Gibt es überhaupt einen belastbaren Fortschritt für diesen Abschnitt? */
export function hasComparableProgress(section: ProgressSourceInput): boolean {
  return section.progress_source !== null && section.source_count > 0
}

function countWith(count: number, noun: SourceNoun, dative: boolean): string {
  if (count === 1) return `${count} ${noun.nominativeSingular}`
  return `${count} ${dative ? noun.dativePlural : noun.nominativePlural}`
}

/**
 * Die QUELLENANGABE zum Abschnittsfortschritt — AC-45δ.9 / AC-45δ.10.
 *
 * Drei Fälle, jeder mit eigener Wahrheit:
 *
 *   • nichts verknüpft            → benennt das ausdrücklich, kein „0 %"
 *   • verknüpft, nichts zählbar   → nennt beide Zahlen, damit die Lücke sichtbar ist
 *   • zählbar                     → „aus N Arbeitspaketen/Phasen im Teilbaum"
 *
 * Führen Arbeitspakete, obwohl auch Phasen verknüpft sind, wird das gesagt statt
 * die Phasen stillschweigend zu verwerfen (Edge Case „Arbeitspakete UND Phasen").
 *
 * Keine der Rückgaben darf als Entwarnung lesbar sein: „nichts verknüpft"
 * bedeutet nicht „nichts offen", sondern „hier ist nichts messbar".
 */
export function describeProgressSource(section: ProgressSourceInput): string {
  const source = section.progress_source

  if (source === null) {
    return "Nichts verknüpft — kein Fortschritt berechenbar"
  }

  const noun = SOURCE_NOUNS[source]
  const alsoPhases =
    source === "work_items" && section.phase_linked_count > 0
      ? ` · ${countWith(section.phase_linked_count, PHASE_NOUN, false)} ebenfalls verknüpft, hier nicht gezählt`
      : ""

  if (section.source_count === 0) {
    // `linked_count` ist hier > 0 (sonst wäre `progress_source` null), aber wir
    // lesen es, statt es zu behaupten.
    return `${countWith(section.linked_count, noun, false)} verknüpft, davon 0 zählbar (abgebrochen) — kein Fortschritt berechenbar${alsoPhases}`
  }

  return `aus ${countWith(section.source_count, noun, true)} im Teilbaum${alsoPhases}`
}

// ── Nächste Fristen ─────────────────────────────────────────────────────────

export interface SplitConstructionDeadlines {
  /** Termin verstrichen — gehört zuerst gezeigt (AC-45δ.12). */
  elapsed: ConstructionDeadlineEntry[]
  upcoming: ConstructionDeadlineEntry[]
}

/**
 * Teilt „Nächste Fristen" in verstrichen und bevorstehend, jeweils aufsteigend
 * nach Datum (AC-45δ.12).
 *
 * `is_elapsed` kommt aus der Auswertung und wird hier NICHT nachgerechnet — es
 * gibt genau einen Zeitbezug (`as_of`, D-δ1), und der liegt serverseitig.
 *
 * Verglichen wird ausschliesslich `due_on` (`YYYY-MM-DD`, lexikographisch =
 * chronologisch). `Array.prototype.sort` ist stabil, gleiche Daten behalten
 * damit die Reihenfolge der Auswertung (dort: `due_on`, `kind`, `ref_number`) —
 * eine zweite Sortierregel hier wäre eine zweite Wahrheit.
 */
export function splitDeadlines(
  entries: readonly ConstructionDeadlineEntry[]
): SplitConstructionDeadlines {
  const byDate = (a: ConstructionDeadlineEntry, b: ConstructionDeadlineEntry) =>
    a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0

  return {
    elapsed: entries.filter((e) => e.is_elapsed).sort(byDate),
    upcoming: entries.filter((e) => !e.is_elapsed).sort(byDate),
  }
}

/** Dieselbe Ordnung als eine Liste: verstrichene zuerst (AC-45δ.12). */
export function deadlinesElapsedFirst(
  entries: readonly ConstructionDeadlineEntry[]
): ConstructionDeadlineEntry[] {
  const { elapsed, upcoming } = splitDeadlines(entries)
  return [...elapsed, ...upcoming]
}
