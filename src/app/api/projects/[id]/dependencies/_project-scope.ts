import type { SupabaseClient } from "@supabase/supabase-js"

import type { DependencyEntityType } from "./_schema"

/**
 * Gehört eine Kante zu diesem Projekt?
 *
 * `dependencies` trägt seit PROJ-9-Round-2 **kein** `project_id` mehr (am
 * Katalog nachgemessen: `id · tenant_id · from_type · from_id · to_type ·
 * to_id · constraint_type · lag_days · created_at · created_by`). Die
 * Zugehörigkeit ergibt sich nur über die Endpunkte, und genau deshalb ist sie
 * leicht zu vergessen.
 *
 * **Warum das nötig ist, obwohl RLS greift.** `is_tenant_member(tenant_id)`
 * hält Fremdmandanten draussen — aber *innerhalb* eines Mandanten ist jede
 * Kante für jedes Mitglied sichtbar. Ohne diese Prüfung ist die Projekt-ID in
 * `/projects/[id]/dependencies/[did]` **Dekoration**: eine Mutation über die
 * Adresse von Projekt A könnte eine Kante von Projekt B treffen. Kein
 * Mandantenleck, aber eine Wirkung am falschen Ort — dieselbe Klasse, die
 * PROJ-45-β an seinen beiden Mutationswegen gefunden und geschlossen hat.
 *
 * Eine Kante zählt als zugehörig, wenn **mindestens ein** Endpunkt im Projekt
 * liegt. Nicht beide: eine projektübergreifende Kante soll von beiden Seiten
 * aus bearbeitbar sein, und die GET-Liste dieses Endpunkts wählt sie nach
 * derselben Regel aus (`route.ts`, OR-Filter über Projekt, Phasen und
 * Arbeitspakete). Zwei verschiedene Zugehörigkeitsbegriffe nebeneinander
 * wären genau die zweite Wahrheit, die dieses Repo an mehreren Stellen teuer
 * bezahlt hat.
 */
export interface DependencyEndpoints {
  from_type: DependencyEntityType
  from_id: string
  to_type: DependencyEntityType
  to_id: string
}

export async function edgeBelongsToProject(
  supabase: SupabaseClient,
  projectId: string,
  edge: DependencyEndpoints,
): Promise<{ belongs: boolean; error: string | null }> {
  // Der billigste Fall zuerst: das Projekt selbst ist ein Endpunkt.
  if (
    (edge.from_type === "project" && edge.from_id === projectId) ||
    (edge.to_type === "project" && edge.to_id === projectId)
  ) {
    return { belongs: true, error: null }
  }

  const phaseIds: string[] = []
  const itemIds: string[] = []
  for (const [type, id] of [
    [edge.from_type, edge.from_id],
    [edge.to_type, edge.to_id],
  ] as const) {
    if (type === "phase") phaseIds.push(id)
    // `work_package` und `todo` liegen beide in `work_items` — die Trennung
    // existiert nur im Kanten-Vokabular, nicht in der Tabelle.
    if (type === "work_package" || type === "todo") itemIds.push(id)
  }

  if (phaseIds.length > 0) {
    const { data, error } = await supabase
      .from("phases")
      .select("id")
      .eq("project_id", projectId)
      .in("id", phaseIds)
      .limit(1)
    if (error) return { belongs: false, error: error.message }
    if ((data ?? []).length > 0) return { belongs: true, error: null }
  }

  if (itemIds.length > 0) {
    const { data, error } = await supabase
      .from("work_items")
      .select("id")
      .eq("project_id", projectId)
      .in("id", itemIds)
      .limit(1)
    if (error) return { belongs: false, error: error.message }
    if ((data ?? []).length > 0) return { belongs: true, error: null }
  }

  return { belongs: false, error: null }
}
