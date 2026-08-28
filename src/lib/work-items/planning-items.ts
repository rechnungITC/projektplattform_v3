/**
 * PROJ-154 — welche Work-Items die Planungsansicht (Phasen + Gantt) sieht.
 *
 * Vorher lud `planung-client.tsx` hart `kinds: ["work_package"]`. Folge, live
 * in Prod gemessen: ein Task mit gesetzter `phase_id` war in der Phasenliste
 * UND im Gantt unsichtbar — obwohl der Bearbeiten-Dialog jedem Work-Item
 * einen Phasen-Picker anbietet und dazu "für Wasserfall-WBS + Gantt" sagt.
 *
 * Die beiden Flächen brauchen unterschiedliche Mengen, deshalb zwei Regeln
 * statt einer:
 *
 * - Phasenliste: alles, was einer Phase zugeordnet ist, unabhängig von der
 *   Art. Die Karte zeigt die Art als Abzeichen, verwechselbar ist nichts.
 * - Gantt: Arbeitspakete wie bisher (auch ohne Phase — sie landen im Eimer
 *   "ohne Phase") PLUS jedes andere Item, das eine Phase trägt. Ohne die
 *   zweite Hälfte bliebe der zugeordnete Task unsichtbar; ohne die
 *   Einschränkung auf zugeordnete Items würde der Eimer "ohne Phase" mit
 *   jedem phasenlosen Task volllaufen (im Messprojekt 22 zusätzliche Zeilen).
 */

import type { WorkItemWithProfile } from "@/types/work-item"

/**
 * Items für die Phasenliste. Die Liste filtert je Phase weiter auf
 * `phase_id === phase.id`; hier fällt nur weg, was gar keiner Phase gehört.
 */
export function phaseListItems(
  items: WorkItemWithProfile[],
): WorkItemWithProfile[] {
  return items.filter((item) => !item.is_deleted && item.phase_id !== null)
}

/**
 * Items für die Gantt-Zeilen: Arbeitspakete (mit und ohne Phase) plus alles
 * andere, das einer Phase zugeordnet ist.
 */
export function ganttRowItems(
  items: WorkItemWithProfile[],
): WorkItemWithProfile[] {
  return items.filter(
    (item) =>
      !item.is_deleted &&
      (item.kind === "work_package" || item.phase_id !== null),
  )
}
