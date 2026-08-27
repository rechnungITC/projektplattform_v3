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
  const { data } = await supabase
    .from("project_skills")
    .select("skill_id, skills(name, is_active, current_version_id)")
    .eq("project_id", projectId)
    .eq("tenant_id", tenantId)

  const activeIds = (data ?? [])
    .filter((row) => {
      const s = row.skills as { is_active?: boolean } | null
      return s?.is_active === true
    })
    .map((row) => row.skill_id as string)

  if (activeIds.length === 0) return []

  const { data: versions } = await supabase
    .from("skill_versions")
    .select("skill_id, markdown_content, status, skills(name)")
    .in("skill_id", activeIds)
    .eq("status", "active")

  return (versions ?? []).map((v) => ({
    name: ((v.skills as { name?: string } | null)?.name ?? "Skill") as string,
    instructions: (v.markdown_content as string) ?? "",
  })).filter((s) => s.instructions.trim().length > 0)
}
