/**
 * PROJ-153-α — Kontext für die Generierung aus dem Vorhaben.
 *
 * Sammelt **nur, was der Mensch geschrieben hat**, plus Projektmetadaten und
 * die aktiven Skill-Anweisungen. Bewusst NICHT gesammelt: Stakeholder,
 * Ressourcen, Beschreibungen anderer Objekte. Der Zweck soll aus dem Vorhaben
 * ableiten, nicht aus dem, was schon im Projekt steht — sonst schlägt er vor,
 * was es bereits gibt.
 *
 * **Was hier hineingeht, geht an den Anbieter.** Deshalb liest der
 * Klassifizierer genau dieselben drei Quellen (CIA-Auflage A-1); die
 * Aufzählungen in beiden Dateien gehören zusammengelesen.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { WorkItemsFromIntentAutoContext } from "./classify-work-items-from-intent"
import { loadActiveProjectSkills } from "./project-chat-skills"

/** Spalten als Daten, damit der Schema-Drift-Wächter sie sieht. */
export const PROJECT_INTENT_PROJECT_COLUMNS =
  "id, name, description, project_type, project_method, tenant_id"

export async function collectWorkItemsFromIntentContext(
  supabase: SupabaseClient,
  projectId: string,
): Promise<WorkItemsFromIntentAutoContext | null> {
  const { data: project, error } = await supabase
    .from("projects")
    .select(PROJECT_INTENT_PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle()

  // Fehler nicht verschlucken — die Lehre aus PROJ-Y-151b: ein stiller
  // null-Rückgabewert sieht aus wie "nichts vorhanden" und lief dort für
  // jedes Projekt ohne Skill-Kontext.
  if (error) {
    console.error(`collectWorkItemsFromIntentContext(projects): ${error.message}`)
    return null
  }
  if (!project) return null

  const row = project as {
    id: string
    name: string
    description: string | null
    project_type: string | null
    project_method: string | null
    tenant_id: string
  }

  const skills = await loadActiveProjectSkills(supabase, row.tenant_id, projectId)

  return {
    project: {
      id: row.id,
      name: row.name,
      description: row.description,
      project_type: row.project_type,
      project_method: row.project_method,
    },
    // α hat keine Dialogrunde — die kommt mit β. Die Form steht schon hier,
    // damit β das Tor und den Klassifizierer nicht neu erfinden muss.
    answers: [],
    skill_instructions:
      skills.length > 0
        ? skills.map((s) => `### ${s.name}\n${s.instructions}`).join("\n\n")
        : null,
  }
}

/** Namen der wirkenden Skills — die Fläche muss sie nennen können (AC-153.16). */
export async function listActiveProjectSkillNames(
  supabase: SupabaseClient,
  tenantId: string,
  projectId: string,
): Promise<string[]> {
  const skills = await loadActiveProjectSkills(supabase, tenantId, projectId)
  return skills.map((s) => s.name)
}
