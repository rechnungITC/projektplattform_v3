/**
 * PROJ-144 — Sprachbefehl → Work-Item-Entwurf (reine Logik, keine I/O).
 *
 * Bewusst regelbasiert und ohne Sprachmodell (Lock L3): der diktierte Text
 * verlässt das Gerät nur zur eigenen Plattform, es entsteht kein Class-3-Fall
 * und kein stiller Stub-Fallback wie bei einem AI-Purpose ohne Ollama.
 *
 * Diese Datei ist absichtlich frei von Datenbank- und Supabase-Bezügen, damit
 * die Methoden-Abbildung über alle sieben Methoden testbar ist. Das ist kein
 * Stilwunsch: die Regel „Art passt zur Methode" ist NICHT in der Datenbank
 * verankert (kein Constraint) — dieser Test ist das einzige Netz (Tech Design D4).
 */

import {
  ALLOWED_PARENT_KINDS,
  isKindVisibleInMethod,
  type WorkItemKind,
} from "@/types/work-item"
import type { ProjectMethod } from "@/types/project-method"

/** Obergrenzen aus `workItemCreateSchema` — hier gespiegelt, damit ein Entwurf
 *  nicht bestätigbar-aber-unspeicherbar sein kann. */
export const WORK_ITEM_TITLE_MAX = 255
export const WORK_ITEM_DESCRIPTION_MAX = 10_000

/**
 * Aufbewahrungsfrist nie bestätigter Sprach-Entwürfe in Tagen (Lock L8).
 *
 * Steht hier statt in der Aufräum-Route, weil zwei Stellen den Wert brauchen:
 * der nächtliche Lauf löscht danach, und das Overlay sagt dem Nutzer zu, wie
 * lange sein Entwurf liegen bleibt. Zwei Kopien wären eine Zusage, die der
 * Aufräum-Lauf still brechen könnte.
 */
export const WORK_ITEM_DRAFT_RETENTION_DAYS = 14

export interface WorkItemCommand {
  /** Die vom Nutzer genannte Art, vor jeder Methoden-Abbildung. */
  requestedKind: WorkItemKind
  /** `null`, wenn nur die Art ohne Inhalt gesagt wurde → Rückfrage (AC-144.3). */
  title: string | null
  /** Überhang aus einem sehr langen Diktat (AC-144.5). */
  description: string | null
  /** Nur gefüllt, wenn der Satz auf „… im Projekt X" endet. */
  projectQuery: string | null
}

export type KindResolution =
  | { status: "resolved"; kind: WorkItemKind; mapped: boolean }
  | { status: "not_creatable"; reason: "requires_parent" | "no_top_level_kind" }

/**
 * Wortstämme je Art. Reihenfolge ist bedeutsam: spezifischere Begriffe zuerst,
 * sonst schluckt `aufgabe` das `unteraufgabe`.
 */
const KIND_TRIGGERS: ReadonlyArray<{ kind: WorkItemKind; pattern: RegExp }> = [
  { kind: "subtask", pattern: /\b(unteraufgaben?|teilaufgaben?|subtasks?)\b/i },
  { kind: "work_package", pattern: /\b(arbeitspakete?|work[\s-]?packages?)\b/i },
  { kind: "story", pattern: /\b(story|storys|stories)\b/i },
  { kind: "epic", pattern: /\b(epics?)\b/i },
  { kind: "feature", pattern: /\b(features?)\b/i },
  { kind: "bug", pattern: /\b(bugs?|fehler|defekte?)\b/i },
  { kind: "task", pattern: /\b(aufgaben?|tasks?|todos?|to-dos?)\b/i },
]

/** „Neue …", „Erstelle …", „Lege … an". */
const CREATE_TRIGGER =
  /\b(neue|neuer|neues|erstelle|erstell|erzeuge|erzeug|lege|leg|mache|mach|anlegen|create|add)\b/i

/**
 * „Erstelle ein Projekt …" gehört dem deployten `project_create_draft` und
 * wird hier NICHT beansprucht (AC-144.31). Entscheidend ist die Nachbarschaft:
 * nur wenn `projekt` direkt das Objekt der Erzeugung ist, tritt diese Slice
 * zurück. „Erstelle eine Story im Projekt ERP" bleibt damit ein Work-Item.
 */
const PROJECT_IS_CREATION_OBJECT =
  /\b(?:neues?|neuer|erstelle|erstell|erzeuge|erzeug|lege|leg|mache|mach|create)\b(?:\s+(?:ein|eine|einen|neues|neue|neuer))?\s+\b(?:projekt|project)\b/i

/** Endet der Satz auf „… im Projekt X"? Dann ist X das Zielprojekt. */
const TRAILING_PROJECT_PHRASE =
  /\s+\b(?:im|in|fuer|für|zum|zur)\s+(?:das\s+|dem\s+)?projekt\s+([^,.;:]+)$/i

/** „Mach im Projekt Apollo eine Story …" — Projekt steht vor der Art. */
const LEADING_PROJECT_PHRASE =
  /\b(?:im|in)\s+(?:dem\s+)?projekt\s+(.+?)\s+(?=(?:eine?|einen|neue?|neuen|neues)\s+(?:story|storys|stories|epic|epics|feature|features|bug|bugs|fehler|aufgabe|aufgaben|task|tasks|arbeitspaket|arbeitspakete)\b)/i

/** Füllwörter zwischen Art und Titel. */
const LEADING_FILLER =
  /^(?:\s*[:–-]\s*|\s*(?:namens|mit\s+dem\s+titel|zum\s+thema|fuer|für|genannt)\s+|\s*(?:eine|einen|ein|die|der|den|dem|das)\s+)+/i

/** Deutsche Verbklammer: „lege … an", „trage … ein". */
const TRAILING_PARTICLE = /\s+\b(an|ein|hinzu)\s*[.!?]*$/i

/**
 * Erkennt einen Anlage-Befehl und trennt Art, Titel und Zielprojekt.
 * Gibt `null` zurück, wenn der Satz kein Anlage-Befehl für ein Work-Item ist —
 * dann greifen die bestehenden Intents unverändert weiter.
 */
export function parseWorkItemCommand(input: string): WorkItemCommand | null {
  const raw = input.trim()
  if (!raw) return null
  if (!CREATE_TRIGGER.test(raw)) return null
  if (PROJECT_IS_CREATION_OBJECT.test(raw)) return null

  const kindHit = findKind(raw)
  if (!kindHit) return null

  // Zielprojekt abtrennen, bevor der Titel gelesen wird — sonst wandert
  // „im Projekt ERP-Rollout" in den Titel.
  let remainder = raw
  let projectQuery: string | null = null
  const leadingProjectMatch = remainder.match(LEADING_PROJECT_PHRASE)
  if (leadingProjectMatch?.index !== undefined) {
    projectQuery = leadingProjectMatch[1]?.trim() || null
    remainder = `${remainder.slice(0, leadingProjectMatch.index)} ${remainder.slice(
      leadingProjectMatch.index + leadingProjectMatch[0].length,
    )}`.replace(/\s+/g, " ").trim()
  } else {
    const projectMatch = remainder.match(TRAILING_PROJECT_PHRASE)
    if (projectMatch) {
      projectQuery = projectMatch[1]?.trim() || null
      remainder = remainder.slice(0, projectMatch.index).trim()
    }
  }

  // Der Titel ist alles nach dem Art-Wort. Die Position wird auf dem
  // gekürzten Rest neu bestimmt, weil das Abtrennen Indizes verschiebt.
  const kindHitInRemainder = findKind(remainder) ?? kindHit
  let titleRaw = remainder.slice(kindHitInRemainder.end).trim()
  titleRaw = titleRaw.replace(LEADING_FILLER, "").trim()
  titleRaw = titleRaw.replace(TRAILING_PARTICLE, "").trim()
  titleRaw = titleRaw.replace(/\s+/g, " ").replace(/[,;:]+$/, "").trim()

  if (!titleRaw) {
    return {
      requestedKind: kindHit.kind,
      title: null,
      description: null,
      projectQuery,
    }
  }

  const { title, overflow } = splitTitleAndOverflow(titleRaw)
  return {
    requestedKind: kindHit.kind,
    title,
    description: overflow,
    projectQuery,
  }
}

/**
 * Ein sehr langes Diktat wird nicht abgeschnitten und verworfen: der Titel
 * endet an der letzten Wortgrenze, der Rest wird Beschreibung (AC-144.5).
 */
export function splitTitleAndOverflow(text: string): {
  title: string
  overflow: string | null
} {
  if (text.length <= WORK_ITEM_TITLE_MAX) return { title: text, overflow: null }

  const cutAt = text.lastIndexOf(" ", WORK_ITEM_TITLE_MAX)
  const boundary = cutAt > 0 ? cutAt : WORK_ITEM_TITLE_MAX
  return {
    title: text.slice(0, boundary).trim(),
    overflow: text.slice(boundary).trim().slice(0, WORK_ITEM_DESCRIPTION_MAX) || null,
  }
}

/**
 * Bildet die gewünschte Art auf eine ab, die in der Projektmethode existiert
 * (Lock L1). Beispiel: `story` gibt es in Wasserfall nicht → `work_package`.
 *
 * Die Rangfolge geht von „am nächsten an einer Liefereinheit" nach unten. Sie
 * liest die Sichtbarkeit über `isKindVisibleInMethod` und die Oberste-Ebene-
 * Erlaubnis über `ALLOWED_PARENT_KINDS` — beide bleiben die einzige
 * Wahrheitsquelle, hier entsteht keine zweite Tabelle (AC-144.6).
 */
const FALLBACK_ORDER: readonly WorkItemKind[] = [
  "story",
  "work_package",
  "task",
] as const

export function resolveTargetKind(
  requested: WorkItemKind,
  method: ProjectMethod | null,
): KindResolution {
  // Eine Unteraufgabe braucht zwingend eine übergeordnete Aufgabe. Elternwahl
  // per Sprache ist in dieser Slice außer Reichweite → ehrliche Absage statt
  // stiller Umdeutung in eine Aufgabe (AC-144.10).
  if (!canBeTopLevel(requested)) {
    return { status: "not_creatable", reason: "requires_parent" }
  }

  if (isKindVisibleInMethod(requested, method)) {
    return { status: "resolved", kind: requested, mapped: false }
  }

  for (const candidate of FALLBACK_ORDER) {
    if (isKindVisibleInMethod(candidate, method) && canBeTopLevel(candidate)) {
      return { status: "resolved", kind: candidate, mapped: true }
    }
  }

  return { status: "not_creatable", reason: "no_top_level_kind" }
}

function canBeTopLevel(kind: WorkItemKind): boolean {
  return ALLOWED_PARENT_KINDS[kind].includes(null)
}

function findKind(
  text: string,
): { kind: WorkItemKind; end: number } | null {
  for (const trigger of KIND_TRIGGERS) {
    const match = text.match(trigger.pattern)
    if (match?.index !== undefined) {
      return { kind: trigger.kind, end: match.index + match[0].length }
    }
  }
  return null
}
