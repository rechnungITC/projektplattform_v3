/**
 * PROJ-45-ε (L31, AC-45ε.1) — der Zielordner im Dokumentenbaum.
 *
 * **Das Anlegen ist seit PROJ-Y-45q nicht mehr hier**, sondern in
 * `create_construction_photo_node`: über den Sitzungs-Client dürfen nur
 * `lead`/`editor`/Admin in den Dokumentenbaum schreiben (PROJ-79), womit ein
 * Betrachter kein Foto hätte hinzufügen können — genau der QA-Befund F-1. Was
 * bleibt, ist das **Lesen**: das darf jedes Projektmitglied, und der Aufrufer
 * braucht die Ordner-Kennung, um den Dateinamen gegen die Geschwister eindeutig
 * zu machen (`dedupeFilename` bleibt die eine Autorität für Kennungen).
 *
 * Die Eindeutigkeit des Ordners kommt aus der Datenbank, nicht aus einer Sperre:
 * `document_tree_nodes_root_slug_uk` ist unique über `(project_id, slug)` für
 * `parent_id is null and deleted_at is null` — live gemessen. Der Wettlauf wird
 * in der Funktion entschieden, der Verlierer liest den Gewinner.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const PHOTO_FOLDER_NAME = "Baufotos"
export const PHOTO_FOLDER_SLUG = "baufotos"

/**
 * Kennung des Fotoordners, oder `null`, wenn es ihn noch nicht gibt (dann hat er
 * auch keine Geschwister, gegen die etwas eindeutig gemacht werden müsste).
 */
export async function findPhotoFolder(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("document_tree_nodes")
    .select("id")
    .eq("project_id", projectId)
    .is("parent_id", null)
    .is("deleted_at", null)
    .eq("slug", PHOTO_FOLDER_SLUG)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { id: string } | null)?.id ?? null
}
