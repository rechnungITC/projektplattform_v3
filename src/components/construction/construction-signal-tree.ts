import type { ConstructionSectionSignal } from "@/types/construction-signals"

/**
 * PROJ-45-δ — die Abschnittsliste der Auswertung als eingerückter Baum
 * (AC-45δ.7: „die Hierarchie aus α bleibt sichtbar, Kinder unter ihren Eltern").
 *
 * WARUM DAS HIER GERECHNET WIRD UND NICHT AUS DER NUTZLAST KOMMT — zwei
 * Messungen an der deployten Auswertung, beide gegen die naheliegende Lesart:
 *
 *  1. `subtree_depth` ist NICHT die Einrücktiefe. In der Migration steht
 *     `(select max(depth) from closure cl where cl.anchor_id = s.id)` — das ist
 *     die HÖHE des Teilbaums UNTER dem Abschnitt. Ein Blatt trägt 0, eine Wurzel
 *     mit Enkeln trägt 2. Als `paddingLeft` benutzt wäre die Einrückung genau
 *     INVERTIERT: Blätter links, Wurzeln am weitesten rechts.
 *  2. Die Liste ist nur FLACH sortiert. Die Auswertung aggregiert mit
 *     `order by (x ->> 'sort_order')::int, x ->> 'label'` — ohne Rücksicht auf
 *     `parent_id`. Zwei Wurzeln und ein Kind mit kleiner `sort_order` reihen
 *     sich also beliebig ineinander; „Kinder unter ihren Eltern" gilt für die
 *     eingehende Reihenfolge NICHT.
 *
 * Beides zusammen heisst: die Tiefe muss aus `parent_id` abgeleitet und die
 * Liste in Vorordnung neu gereiht werden. Die Ordnungsregeln sind absichtlich
 * dieselben wie in α (`buildSectionTree`): `sort_order`, dann `label` mit
 * deutscher Kollation — zwei verschiedene Reihenfolgen für denselben Baum wären
 * eine zweite Wahrheit.
 *
 * α's Funktion lässt sich nicht wiederverwenden: sie verlangt `ConstructionSection`
 * (Feld `id`, dazu `tenant_id`/`project_id`/`path`/Zeitstempel), die Signalzeile
 * trägt `section_id` und keines der übrigen Felder. Sie zu generalisieren hiesse
 * eine geteilte α-Datei anzufassen; die Ordnungsregel ist stattdessen hier
 * gespiegelt und mit denselben Grenzfällen eingefroren.
 */
export interface ConstructionSignalSectionRow {
  section: ConstructionSectionSignal
  /** Einrücktiefe: 0 für Wurzeln. NICHT `subtree_depth` (siehe oben). */
  depth: number
}

export function buildSignalSectionRows(
  sections: readonly ConstructionSectionSignal[]
): ConstructionSignalSectionRow[] {
  const byId = new Map<string, ConstructionSectionSignal>()
  for (const s of sections) byId.set(s.section_id, s)

  const childrenOf = new Map<string, ConstructionSectionSignal[]>()
  const roots: ConstructionSectionSignal[] = []

  for (const s of sections) {
    // Ein Abschnitt, dessen Eltern nicht in der Liste sind, erscheint auf
    // Wurzelebene statt zu verschwinden — dieselbe Zusage wie in α. Hier wiegt
    // sie schwerer: diese Zeilen tragen Blocker- und Überfälligkeitszahlen.
    const parentId =
      s.parent_id && byId.has(s.parent_id) ? s.parent_id : null
    if (parentId === null) {
      roots.push(s)
      continue
    }
    const bucket = childrenOf.get(parentId)
    if (bucket) bucket.push(s)
    else childrenOf.set(parentId, [s])
  }

  const byOrder = (a: ConstructionSectionSignal, b: ConstructionSectionSignal) =>
    a.sort_order - b.sort_order || a.label.localeCompare(b.label, "de")

  const out: ConstructionSignalSectionRow[] = []
  const seen = new Set<string>()

  const walk = (nodes: ConstructionSectionSignal[], depth: number) => {
    for (const node of [...nodes].sort(byOrder)) {
      // Schutz gegen einen Zyklus in `parent_id`: ohne ihn liefe der Abstieg
      // endlos. α hat diesen Fall nicht, verliert die Zeilen dafür lautlos.
      if (seen.has(node.section_id)) continue
      seen.add(node.section_id)
      out.push({ section: node, depth })
      walk(childrenOf.get(node.section_id) ?? [], depth + 1)
    }
  }

  walk(roots, 0)

  // Was ein Zyklus vom Abstieg abgeschnitten hat, kommt auf Wurzelebene nach.
  // Nichts darf still verschwinden — auch nicht bei kaputten Daten.
  const stranded = sections.filter((s) => !seen.has(s.section_id))
  if (stranded.length > 0) walk(stranded, 0)

  return out
}
