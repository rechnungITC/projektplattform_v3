/**
 * PROJ-45-ε (L31, AC-45ε.1, AC-45εH-16) — der Zielordner im Dokumentenbaum.
 *
 * Die Fotoaufnahme verlangt bewusst **keine** Ordnerwahl: eine Bauleitung mit
 * nassen Händen auf dem Gerüst soll fotografieren, nicht navigieren. ε legt
 * deshalb genau **einen** Wurzelordner je Projekt an und findet ihn beim zweiten
 * Foto wieder.
 *
 * Die Eindeutigkeit kommt aus der Datenbank, nicht aus einer Sperre im Code:
 * `document_tree_nodes_root_slug_uk` ist unique über `(project_id, slug)` für
 * `parent_id is null and deleted_at is null` — live gemessen. Zwei gleichzeitige
 * Uploads können also nicht zwei Ordner anlegen; der Verlierer bekommt `23505`
 * und liest den Gewinner. Kein Advisory-Lock nötig.
 *
 * Ein vom Nutzer in den Papierkorb gelegter Ordner fällt aus dem Index heraus,
 * ein neuer entsteht also. Für Fotos ist das kein Verlustfall: der Lösch-Wächter
 * auf `documents` weist das Papierkorbieren eines Teilbaums ab, solange darin ein
 * verknüpftes Foto liegt (`dms_soft_delete_subtree` setzt `documents.deleted_at`
 * und löst damit `documents_construction_photo_lock` aus — ebenfalls gemessen).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const PHOTO_FOLDER_NAME = "Baufotos"
export const PHOTO_FOLDER_SLUG = "baufotos"

export interface PhotoFolderResult {
  nodeId: string
  created: boolean
}

export async function ensurePhotoFolder(
  supabase: SupabaseClient,
  tenantId: string,
  projectId: string,
  userId: string,
): Promise<PhotoFolderResult> {
  const find = async () => {
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

  const existing = await find()
  if (existing) return { nodeId: existing, created: false }

  const { data, error } = await supabase
    .from("document_tree_nodes")
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      parent_id: null,
      node_type: "folder",
      name: PHOTO_FOLDER_NAME,
      slug: PHOTO_FOLDER_SLUG,
      created_by: userId,
    })
    .select("id")
    .single()

  if (error) {
    // Wettlauf: eine parallele Aufnahme war schneller. Der Gewinner ist der
    // Ordner — nachlesen statt scheitern.
    if (error.code === "23505") {
      const won = await find()
      if (won) return { nodeId: won, created: false }
    }
    throw new Error(error.message)
  }
  return { nodeId: (data as unknown as { id: string }).id, created: true }
}
