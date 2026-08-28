/**
 * PROJ-154 — welche Work-Items die Planungsansicht (Phasen + Gantt) sieht.
 *
 * Vorher lud `planung-client.tsx` hart `kinds: ["work_package"]`. Folge, live
 * in Prod gemessen: ein Task mit gesetzter `phase_id` war in der Phasenliste
 * UND im Gantt unsichtbar — obwohl der Bearbeiten-Dialog jedem Work-Item
 * einen Phasen-Picker anbietet und dazu "für Wasserfall-WBS + Gantt" sagt.
 *
 * - Phasenliste: alles, was einer Phase zugeordnet ist, unabhängig von der
 *   Art. Die Karte zeigt die Art als Abzeichen, verwechselbar ist nichts.
 * - Gantt: **umgezogen nach `gantt-rows.ts` (PROJ-155-α).** Die frühere Regel
 *   hier filterte auf `kind === "work_package" || phase_id !== null` und liess
 *   damit einen Task, der per `parent_id` an seinem Arbeitspaket hängt, gar
 *   nicht erst durch — in Prod 39 von 48. Sichtbarkeit braucht den Baum, also
 *   entscheidet sie dort; die Einschränkung des Eimers "ohne Phase" auf
 *   Arbeitspakete ist mit umgezogen, damit er nicht mit dem Scrum-Backlog
 *   volläuft (im Messprojekt 22 zusätzliche Zeilen).
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

