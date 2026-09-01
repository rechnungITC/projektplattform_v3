/**
 * PROJ-155-α — Zeilenaufbau des Gantt: WBS-Hierarchie + abgeleitete Termine.
 *
 * Drei live gegen Prod gemessene Befunde treiben diese Datei:
 *
 * 1. **Tasks waren unsichtbar.** PROJ-154 zeigt ein Nicht-Arbeitspaket nur,
 *    wenn es selbst eine `phase_id` traegt. Gemessen: von 48 Tasks tragen
 *    **39** ein `parent_id` und nur **1** eine `phase_id` — der Rest war
 *    unsichtbar, obwohl er in der WBS unter seinem Arbeitspaket haengt. Ein
 *    Task gehoert zur Phase seines Vorfahren, nicht zu einer eigenen.
 *
 * 2. **Kein Sammelvorgang.** Ein Elternteil ohne eigene Termine bekommt in
 *    MS Project und OpenProject die Spanne seiner Kinder. Die Spalten
 *    `derived_planned_*` gibt es seit PROJ-36; gefuellt werden sie erst seit
 *    der Migration dieser Slice — vorher las der Rollup-Trigger ein
 *    JSONB-Feld, das kein Schreibpfad fuellt (0 von 138 Zeilen).
 *
 * 3. **Keine Ordnung am Zeitstrahl.** Die alte Gruppierung sortierte gar
 *    nicht, die Reihenfolge war die der API-Antwort. Hier wird je Ebene nach
 *    Termin sortiert; Zeilen ohne Termin wandern nach unten, statt die
 *    Balkenfolge zu zerreissen.
 *
 * Reine Logik ohne React und ohne I/O — damit die Regeln pruefbar sind statt
 * in 1800 Zeilen Render-Code zu verschwinden.
 */

import type { Phase } from "@/types/phase"
import type { WorkItemWithProfile } from "@/types/work-item"

/** Woher der Balken sein Datum hat. Die Oberflaeche stellt das unterschiedlich dar. */
export type DateSource = "own" | "derived" | "none"

interface RowBase {
  key: string
  /** 0 = Phase oder Eimer, 1 = direkt darunter, 2 = tiefer. Treibt die Einrueckung. */
  depth: number
  hasChildren: boolean
  /** Zugeklappt: die eigenen Nachkommen fehlen in der Zeilenliste. */
  collapsed: boolean
  start: string | null
  end: string | null
  dateSource: DateSource
}

export interface GanttPhaseRow extends RowBase {
  kind: "phase"
  phase: Phase
  depth: 0
}

export interface GanttItemRow extends RowBase {
  kind: "work_item"
  item: WorkItemWithProfile
}

/** Kopfzeile fuer Items ohne Phasenzuordnung. */
export interface GanttBucketRow extends RowBase {
  kind: "bucket"
  label: string
  depth: 0
  start: null
  end: null
  dateSource: "none"
}

export type GanttRow = GanttPhaseRow | GanttItemRow | GanttBucketRow

export const UNPHASED_BUCKET_KEY = "bucket:unphased"

export function itemRowKey(id: string): string {
  return `work_item:${id}`
}

export function phaseRowKey(id: string): string {
  return `phase:${id}`
}

/**
 * Effektive Termine eines Items: die eigenen zuerst, sonst die aus den
 * Kindern abgeleiteten. Dieselbe Vorrangregel wie im Rollup-Trigger — die
 * Autoritaet ist die Datenbank, hier wird sie nur gelesen.
 */
export function effectiveDates(item: WorkItemWithProfile): {
  start: string | null
  end: string | null
  source: DateSource
} {
  const ownStart = item.planned_start ?? null
  const ownEnd = item.planned_end ?? null
  if (ownStart || ownEnd) {
    return { start: ownStart, end: ownEnd, source: "own" }
  }
  const derivedStart = item.derived_planned_start ?? null
  const derivedEnd = item.derived_planned_end ?? null
  if (derivedStart || derivedEnd) {
    return { start: derivedStart, end: derivedEnd, source: "derived" }
  }
  return { start: null, end: null, source: "none" }
}

/**
 * Sortierung innerhalb einer Ebene: nach Start, dann Ende, dann Position und
 * Titel. Terminlose Zeilen zuletzt — sie haben am Zeitstrahl keinen Ort.
 */
function compareRows(a: WorkItemWithProfile, b: WorkItemWithProfile): number {
  const da = effectiveDates(a)
  const db = effectiveDates(b)
  if (da.start && db.start) {
    if (da.start !== db.start) return da.start < db.start ? -1 : 1
    const ea = da.end ?? ""
    const eb = db.end ?? ""
    if (ea !== eb) return ea < eb ? -1 : 1
  } else if (da.start && !db.start) {
    return -1
  } else if (!da.start && db.start) {
    return 1
  }
  const pa = a.position ?? Number.MAX_SAFE_INTEGER
  const pb = b.position ?? Number.MAX_SAFE_INTEGER
  if (pa !== pb) return pa - pb
  return a.title.localeCompare(b.title, "de")
}

export interface BuildGanttRowsInput {
  phases: Phase[]
  items: WorkItemWithProfile[]
  /** Keys zugeklappter Zeilen (Phasen-, Item- oder Eimer-Key). */
  collapsedKeys?: ReadonlySet<string>
}

/**
 * Arten, die als *unverankerte* Wurzel in den Eimer "Ohne Phase" duerfen.
 *
 * Diese Einschraenkung ist PROJ-154s Anliegen, hierher gezogen: laesst man
 * jede Art zu, laeuft der Eimer mit dem ganzen Scrum-Backlog voll (im
 * Messprojekt 22 zusaetzliche Zeilen). Sie gilt ausdruecklich nur fuer
 * Wurzeln — ein Task UNTER einem sichtbaren Arbeitspaket erscheint immer,
 * genau die Haelfte, die vorher fehlte.
 */
const UNPHASED_ROOT_KINDS: ReadonlySet<string> = new Set(["work_package"])

export function buildGanttRows(input: BuildGanttRowsInput): GanttRow[] {
  const { phases, items } = input
  const collapsed = input.collapsedKeys ?? new Set<string>()

  const alive = items.filter((item) => !item.is_deleted)
  const byId = new Map(alive.map((item) => [item.id, item]))
  const phaseIds = new Set(phases.map((phase) => phase.id))

  const childrenOf = new Map<string, WorkItemWithProfile[]>()
  for (const item of alive) {
    // Ein Elternteil ausserhalb der Menge (geloescht oder weggefiltert) zaehlt
    // nicht — sonst verschwindet sein ganzer Zweig lautlos.
    if (!item.parent_id || !byId.has(item.parent_id)) continue
    const list = childrenOf.get(item.parent_id) ?? []
    list.push(item)
    childrenOf.set(item.parent_id, list)
  }

  /**
   * Die Phase, an der ein Item haengt: die eigene, sonst die des naechsten
   * Vorfahren mit gesetzter Zuordnung. `null` = keine Verankerung.
   */
  function anchorOf(item: WorkItemWithProfile): string | null {
    let cursor: WorkItemWithProfile | undefined = item
    const seen = new Set<string>()
    while (cursor) {
      if (seen.has(cursor.id)) return null // Zyklus-Riegel
      seen.add(cursor.id)
      if (cursor.phase_id && phaseIds.has(cursor.phase_id)) return cursor.phase_id
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
    }
    return null
  }

  /**
   * Laeuft die Elternkette dieses Items in einen Zyklus? Ein Item im Zyklus
   * hat keinen erreichbaren Wurzelknoten und wuerde ohne Sonderbehandlung
   * ganz aus der Liste fallen — lieber flach zeigen als verschwinden lassen.
   */
  function isInCycle(item: WorkItemWithProfile): boolean {
    let cursor: WorkItemWithProfile | undefined = item
    const seen = new Set<string>()
    while (cursor) {
      if (seen.has(cursor.id)) return true
      seen.add(cursor.id)
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined
    }
    return false
  }

  // Schritt 1 — welche Items gehoeren ueberhaupt in den Gantt.
  // Saat: alles mit Phasen-Verankerung plus die im Eimer zugelassenen Arten.
  // Dann erben Nachkommen die Sichtbarkeit ihres Elternteils. Zwei Schritte
  // statt einer verschachtelten Bedingung, weil sonst ein Arbeitspaket unter
  // einer unverankerten Story stillschweigend herausfaellt.
  const visible = new Set<string>()
  for (const item of alive) {
    if (anchorOf(item) || UNPHASED_ROOT_KINDS.has(item.kind)) {
      visible.add(item.id)
    }
  }
  let grew = true
  while (grew) {
    grew = false
    for (const item of alive) {
      if (visible.has(item.id)) continue
      if (item.parent_id && visible.has(item.parent_id)) {
        visible.add(item.id)
        grew = true
      }
    }
  }

  // Schritt 2 — Wurzeln: sichtbare Items, deren Elternteil unsichtbar ist
  // oder an einer anderen Phase haengt. Alles andere rendert im Teilbaum.
  const rootsByPhase = new Map<string, WorkItemWithProfile[]>()
  const unphasedRoots: WorkItemWithProfile[] = []
  const rootIds = new Set<string>()

  for (const item of alive) {
    if (!visible.has(item.id)) continue
    const parent = item.parent_id ? byId.get(item.parent_id) : undefined
    const parentVisible = parent ? visible.has(parent.id) : false
    const anchor = anchorOf(item)
    const isRoot =
      !parentVisible || isInCycle(item) || anchorOf(parent!) !== anchor
    if (!isRoot) continue
    rootIds.add(item.id)
    if (anchor) {
      const list = rootsByPhase.get(anchor) ?? []
      list.push(item)
      rootsByPhase.set(anchor, list)
    } else {
      unphasedRoots.push(item)
    }
  }

  const out: GanttRow[] = []

  function pushSubtree(
    item: WorkItemWithProfile,
    depth: number,
    ancestorCollapsed: boolean,
  ): void {
    const key = itemRowKey(item.id)
    // Kinder, die selbst Wurzel sind, gehoeren woanders hin (eigene Phase)
    // oder liegen in einem Zyklus. Sie hier mitzurendern wuerde sie doppelt
    // zeigen bzw. endlos rekursieren.
    const kids = (childrenOf.get(item.id) ?? [])
      .filter((kid) => !rootIds.has(kid.id))
      .slice()
      .sort(compareRows)
    const isCollapsed = collapsed.has(key)
    const dates = effectiveDates(item)
    if (!ancestorCollapsed) {
      out.push({
        kind: "work_item",
        key,
        item,
        depth,
        hasChildren: kids.length > 0,
        collapsed: isCollapsed,
        start: dates.start,
        end: dates.end,
        dateSource: dates.source,
      })
    }
    for (const kid of kids) {
      pushSubtree(kid, depth + 1, ancestorCollapsed || isCollapsed)
    }
  }

  for (const phase of phases) {
    const key = phaseRowKey(phase.id)
    const roots = (rootsByPhase.get(phase.id) ?? []).slice().sort(compareRows)
    const isCollapsed = collapsed.has(key)
    out.push({
      kind: "phase",
      key,
      phase,
      depth: 0,
      hasChildren: roots.length > 0,
      collapsed: isCollapsed,
      start: phase.planned_start ?? null,
      end: phase.planned_end ?? null,
      dateSource: phase.planned_start || phase.planned_end ? "own" : "none",
    })
    for (const root of roots) {
      pushSubtree(root, 1, isCollapsed)
    }
  }

  if (unphasedRoots.length > 0) {
    const isCollapsed = collapsed.has(UNPHASED_BUCKET_KEY)
    out.push({
      kind: "bucket",
      key: UNPHASED_BUCKET_KEY,
      label: "Ohne Phase",
      depth: 0,
      hasChildren: true,
      collapsed: isCollapsed,
      start: null,
      end: null,
      dateSource: "none",
    })
    for (const root of unphasedRoots.slice().sort(compareRows)) {
      pushSubtree(root, 1, isCollapsed)
    }
  }

  return out
}
