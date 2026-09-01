/**
 * PROJ-155-β.2 — Auto-Scheduling: die Kaskaden-Rechnung.
 *
 * **Reine Funktion, kein I/O.** Das ist keine Stilfrage, sondern der Grund, warum
 * es hier nur EINE Formel gibt statt zwei.
 *
 * Der Design-Brief führt unter R-A das Risiko, Vorschau (Browser) und autoritative
 * Rechnung (Server) seien „zwei Kopien einer Formel" — die Klasse, an der PROJ-45-γ
 * sich stieß, wo Postgres am Monatsende klemmte und `setUTCMonth` überlief, sodass
 * die Maske ein anderes rechtlich relevantes Fristende zeigte als gespeichert wurde.
 *
 * Weil diese Funktion ohne I/O auskommt, laufen **beide** Seiten durch sie:
 * die Vorschau im Browser und `POST /api/projects/[id]/schedule/apply` auf dem
 * Server. Der Server bleibt trotzdem die Autorität — er lädt Kanten und Termine
 * FRISCH aus der Datenbank und rechnet neu; der Browser hat möglicherweise einen
 * veralteten Stand. Weicht das Ergebnis ab, gewinnt der Server und sagt es
 * (Nutzer-Entscheid Q1). Divergenz durch zwei Implementierungen kann es dabei
 * nicht geben, weil es nur eine gibt.
 */

import type { DependencyConstraintType } from "@/types/dependency"

/** Ein Termin-Paar in ISO-Kurzform (`YYYY-MM-DD`). `null` = nicht gesetzt. */
export interface ScheduleWindow {
  start: string | null
  end: string | null
}

/**
 * Ein Fenster, dessen beide Termine gesetzt sind.
 *
 * Bewusst ein eigener Typ und **nicht** `FixedWindow`: `Required`
 * entfernt nur die Optionalität (`?`), nicht das `| null`. Die erste Fassung nutzte
 * `Required` und der Compiler hat es an acht Stellen abgelehnt — zu Recht, sonst
 * wäre `parseDay(null)` ein Laufzeitfehler geworden.
 */
export interface FixedWindow {
  start: string
  end: string
}

/** Eine Kante, reduziert auf das, was die Rechnung braucht. */
export interface CascadeEdge {
  fromId: string
  toId: string
  constraintType: DependencyConstraintType
  lagDays: number
}

/** Ein Knoten mit seinem heutigen Termin-Fenster. */
export interface CascadeNode {
  id: string
  window: ScheduleWindow
}

/** Eine berechnete Verschiebung. Dauer bleibt erhalten. */
export interface CascadeShift {
  id: string
  start: string
  end: string
  /** Um wie viele Tage sich der Knoten bewegt. Nie 0 in der Ergebnisliste. */
  deltaDays: number
}

/** Ein Nachfolger, der nicht verschoben werden kann. */
export interface CascadeSkip {
  id: string
  /**
   * `no_dates` — der Knoten hat keinen Termin. Er bekommt **keinen erfunden**
   * (AC-16): einen Termin aus einer Kante abzuleiten wäre dieselbe Erfindung, die
   * α bei den Sammelvorgängen abgelehnt hat.
   */
  reason: "no_dates"
}

/** Eine Bedingung, die nach der Kaskade noch verletzt ist. */
export interface CascadeConflict {
  edgeFromId: string
  edgeToId: string
  constraintType: DependencyConstraintType
  /** Um wie viele Tage die Bedingung verletzt bleibt (immer > 0). */
  shortfallDays: number
}

export interface CascadeResult {
  shifts: CascadeShift[]
  skipped: CascadeSkip[]
  conflicts: CascadeConflict[]
  /** Wurde die Tiefengrenze erreicht? Dann ist das Ergebnis unvollständig. */
  truncated: boolean
}

/**
 * Tiefengrenze der Kaskade. Der Graph ist per Trigger zyklenfrei
 * (`tg_dep_prevent_polymorphic_cycle`, BEFORE INSERT **und** UPDATE, eigener
 * Riegel bei 10000 — im CIA-Pass als F-6 nachgemessen), eine topologische Ordnung
 * existiert also immer. Die Grenze hier ist deshalb kein Zyklenschutz, sondern
 * eine Zusicherung gegen unbegrenzte Laufzeit bei pathologisch tiefen Ketten.
 *
 * **Wird sie erreicht, wird das ausgewiesen** (`truncated`), nicht verschwiegen —
 * die Lehre aus PROJ-Y-45l, wo ein Riegel bei 20 still unterberichtete.
 */
export const CASCADE_MAX_DEPTH = 200

const MS_PER_DAY = 86_400_000

function parseDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  return formatDay(parseDay(iso) + days * MS_PER_DAY)
}

function diffDays(aIso: string, bIso: string): number {
  return Math.round((parseDay(aIso) - parseDay(bIso)) / MS_PER_DAY)
}

/**
 * Die früheste Lage, die eine Kante ihrem Nachfolger erlaubt.
 *
 * Vier Typen, vier Bezugspunkte — genau das, was AC-17 einzeln nachweisbar
 * verlangt. `lag` verschiebt die Grenze in beide Richtungen.
 *
 * Zurückgegeben wird, welches Ende des Nachfolgers gebunden ist und auf welchen
 * Tag es mindestens fallen muss.
 */
function earliestBound(
  edge: CascadeEdge,
  predecessor: FixedWindow,
): { anchor: "start" | "end"; day: string } | null {
  const lag = edge.lagDays
  switch (edge.constraintType) {
    /**
     * Nachfolger startet, **nachdem** der Vorgänger endet.
     *
     * Das `+ 1` ist die einzige Stelle, an der ein Typ einen Tag Abstand braucht,
     * und der Grund sind **inklusive** Enddaten: ein Arbeitspaket, das am 10.
     * endet, belegt den 10.; sein Nachfolger kann frühestens am 11. beginnen.
     * Die drei anderen Typen beziehen gleichartige Grenzen aufeinander
     * (Start↔Start, Ende↔Ende) oder erlauben Überlappung am selben Tag (SF), also
     * kommt dort keiner dazu.
     *
     * Die erste Fassung hatte das `+ 1` vergessen — 13 von 20 Testfällen fielen,
     * jeder um genau einen Tag. Die Tests standen vor der Implementierung und
     * haben sie korrigiert, nicht umgekehrt.
     */
    case "FS":
      return { anchor: "start", day: addDaysIso(predecessor.end, lag + 1) }
    // Nachfolger startet, nachdem der Vorgänger startet.
    case "SS":
      return { anchor: "start", day: addDaysIso(predecessor.start, lag) }
    // Nachfolger endet, nachdem der Vorgänger endet.
    case "FF":
      return { anchor: "end", day: addDaysIso(predecessor.end, lag) }
    // Nachfolger endet, nachdem der Vorgänger startet.
    case "SF":
      return { anchor: "end", day: addDaysIso(predecessor.start, lag) }
  }
}

/**
 * Berechnet, welche Nachfolger sich mitverschieben, wenn ein Knoten gezogen wird.
 *
 * **Alle Vorgänger eines Nachfolgers zählen, nicht nur der, über den die Kaskade
 * kam.** Ohne das wäre eine Rückwärts-Verschiebung falsch: ein Knoten darf nur so
 * weit nach links, wie seine strengste Bedingung es erlaubt — auch wenn die von
 * einem Vorgänger kommt, der gar nicht bewegt wurde.
 *
 * @param movedId       der gezogene Knoten
 * @param movedWindow   sein NEUES Fenster (nach dem Zug)
 * @param nodes         alle Knoten mit ihren heutigen Fenstern (inkl. `movedId`)
 * @param edges         alle Kanten des Projekts
 */
export function computeScheduleCascade(
  movedId: string,
  movedWindow: FixedWindow,
  nodes: readonly CascadeNode[],
  edges: readonly CascadeEdge[],
): CascadeResult {
  const byId = new Map<string, CascadeNode>()
  for (const n of nodes) byId.set(n.id, n)

  const outgoing = new Map<string, CascadeEdge[]>()
  const incoming = new Map<string, CascadeEdge[]>()
  for (const e of edges) {
    if (!outgoing.has(e.fromId)) outgoing.set(e.fromId, [])
    outgoing.get(e.fromId)!.push(e)
    if (!incoming.has(e.toId)) incoming.set(e.toId, [])
    incoming.get(e.toId)!.push(e)
  }

  // Aktuelle Lage jedes Knotens während der Rechnung. Der gezogene Knoten
  // startet mit seinem neuen Fenster, alle anderen mit ihrem heutigen.
  const current = new Map<string, FixedWindow>()
  for (const n of nodes) {
    if (n.window.start && n.window.end) {
      current.set(n.id, { start: n.window.start, end: n.window.end })
    }
  }
  current.set(movedId, { ...movedWindow })

  const shifts = new Map<string, CascadeShift>()
  const skipped = new Map<string, CascadeSkip>()
  let truncated = false

  // Breitensuche über die Nachfolger. Ein Knoten kann mehrfach in die
  // Warteschlange geraten (mehrere Vorgänger); das ist gewollt, weil eine
  // spätere Verschiebung eines anderen Vorgängers ihn weiter schieben kann.
  let frontier: string[] = [movedId]
  for (let depth = 0; depth < CASCADE_MAX_DEPTH && frontier.length > 0; depth++) {
    const next = new Set<string>()
    for (const fromId of frontier) {
      for (const edge of outgoing.get(fromId) ?? []) {
        const target = byId.get(edge.toId)
        if (!target) continue

        // AC-16: kein Termin -> kein erfundener Termin.
        if (!target.window.start || !target.window.end) {
          skipped.set(edge.toId, { id: edge.toId, reason: "no_dates" })
          continue
        }

        const targetNow = current.get(edge.toId)
        if (!targetNow) continue

        // Strengste Grenze über ALLE Vorgänger dieses Knotens.
        let requiredDelta = Number.NEGATIVE_INFINITY
        let anyBound = false
        for (const inEdge of incoming.get(edge.toId) ?? []) {
          const pred = current.get(inEdge.fromId)
          if (!pred) continue
          const bound = earliestBound(inEdge, pred)
          if (!bound) continue
          anyBound = true
          const actual =
            bound.anchor === "start" ? targetNow.start : targetNow.end
          requiredDelta = Math.max(requiredDelta, diffDays(bound.day, actual))
        }
        if (!anyBound || requiredDelta === Number.NEGATIVE_INFINITY) continue
        /**
         * **Nur nach rechts, nie nach links.** Ein negatives `requiredDelta` heißt
         * „die Bedingung ist erfüllt, der Nachfolger hätte sogar Luft" — daraus
         * eine Verschiebung zu machen würde einen Plan verdichten, den niemand
         * verdichten wollte. Der Schalter heißt „Nachfolger automatisch
         * **mitverschieben**", nicht „Plan optimieren".
         */
        if (requiredDelta <= 0) continue

        const newStart = addDaysIso(targetNow.start, requiredDelta)
        const newEnd = addDaysIso(targetNow.end, requiredDelta)
        current.set(edge.toId, { start: newStart, end: newEnd })

        const totalDelta = diffDays(newStart, target.window.start)
        if (totalDelta === 0) {
          shifts.delete(edge.toId)
        } else {
          shifts.set(edge.toId, {
            id: edge.toId,
            start: newStart,
            end: newEnd,
            deltaDays: totalDelta,
          })
        }
        next.add(edge.toId)
      }
    }
    frontier = [...next]
    if (frontier.length > 0 && depth === CASCADE_MAX_DEPTH - 1) truncated = true
  }

  // Was nach der Kaskade noch verletzt ist — typischerweise eine Kante auf einen
  // Knoten ohne Termine, der sich nicht bewegen ließ.
  const conflicts: CascadeConflict[] = []
  for (const edge of edges) {
    const pred = current.get(edge.fromId)
    const succ = current.get(edge.toId)
    if (!pred || !succ) continue
    const bound = earliestBound(edge, pred)
    if (!bound) continue
    const actual = bound.anchor === "start" ? succ.start : succ.end
    const shortfall = diffDays(bound.day, actual)
    if (shortfall > 0) {
      conflicts.push({
        edgeFromId: edge.fromId,
        edgeToId: edge.toId,
        constraintType: edge.constraintType,
        shortfallDays: shortfall,
      })
    }
  }

  return {
    shifts: [...shifts.values()],
    skipped: [...skipped.values()],
    conflicts,
    truncated,
  }
}
