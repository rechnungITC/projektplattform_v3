/**
 * PROJ-151-α — aktive Skills eines Projekts als Zusatzanweisung (Q4).
 *
 * V3s Skill-Begriff gilt (Lock L4): PROJ-76/77 mit unveränderlichen Fassungen
 * und Aktivierung. U-Know nennt etwas anderes „Skills"; zwei Begriffe im selben
 * Produkt wären der Fehler.
 *
 * Der Inhalt ist ausdrücklich ERGÄNZUNG, nicht Ersatz — der Grundauftrag steht
 * im Runner. Sonst könnte Datenpflege Lock L5 aushebeln.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// Die Spalte heisst `markdown_content`, NICHT `content_md`. Der erste Entwurf
// hatte den falschen Namen — der Schema-Drift-Waechter (PROJ-42) hat ihn
// gefunden, bevor er in Prod ankam. Wirkung waere still gewesen: das Feld
// undefined, der Laengenfilter unten haette jeden Skill verworfen, und der
// Chat waere ohne Skill-Kontext gelaufen, ohne dass irgendetwas rot wird.

export interface ProjectChatSkill {
  name: string
  instructions: string
}

export async function loadProjectChatSkills(
  supabase: SupabaseClient,
  tenantId: string,
  projectId: string,
): Promise<ProjectChatSkill[]> {
  const { data, error } = await supabase
    .from("project_skills")
    .select("skill_id, skills(name, is_active, current_version_id)")
    .eq("project_id", projectId)
    .eq("tenant_id", tenantId)

  // Fehler NICHT verschlucken. Die erste Fassung tat das an beiden Abfragen,
  // und genau deshalb blieb der Defekt unten unsichtbar (PROJ-Y-151b).
  if (error) {
    console.error(`loadProjectChatSkills(project_skills): ${error.message}`)
    return []
  }

  // Der Name kommt aus DIESER Abfrage. Frueher holte ihn die zweite Abfrage
  // ueber `skills(name)` noch einmal — und scheiterte daran:
  //
  //   "Could not embed because more than one relationship was found for
  //    'skill_versions' and 'skills'"
  //
  // Zwischen den beiden Tabellen bestehen ZWEI Fremdschluessel
  // (`skill_versions.skill_id -> skills.id` und
  // `skills.current_version_id -> skill_versions.id`), PostgREST kann die
  // Einbettung also nicht aufloesen. Weil der Fehler verschluckt wurde, war
  // `versions` null, die Liste leer — und der Chat lief fuer JEDES Projekt
  // ohne Skill-Kontext, ohne dass irgendetwas rot wurde. Live gefunden erst
  // durch den echten Anbieter-Durchlauf: das vom Skill vorgeschriebene
  // Losungswort fehlte in der Antwort.
  //
  // Der Schema-Drift-Waechter konnte das nicht fangen — er prueft, ob
  // Spalten existieren, nicht ob eine Einbettung eindeutig ist.
  const names = new Map<string, string>()
  const activeIds: string[] = []
  for (const row of data ?? []) {
    const s = row.skills as { name?: string; is_active?: boolean } | null
    if (s?.is_active !== true) continue
    const id = row.skill_id as string
    activeIds.push(id)
    names.set(id, s.name ?? "Skill")
  }

  if (activeIds.length === 0) return []

  const { data: versions, error: versionError } = await supabase
    .from("skill_versions")
    .select("skill_id, markdown_content")
    .in("skill_id", activeIds)
    .eq("status", "active")

  if (versionError) {
    console.error(`loadProjectChatSkills(skill_versions): ${versionError.message}`)
    return []
  }

  return (versions ?? [])
    .map((v) => ({
      name: names.get(v.skill_id as string) ?? "Skill",
      instructions: (v.markdown_content as string) ?? "",
    }))
    .filter((s) => s.instructions.trim().length > 0)
}
