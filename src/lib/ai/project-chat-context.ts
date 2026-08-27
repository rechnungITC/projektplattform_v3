/**
 * PROJ-151-α — Kontext einer Chat-Antwort aus dem, was V3 ohnehin weiß.
 *
 * Bewusst **ohne Retrieval** (Lock L6): keine Dokumentsuche, keine Einbettungen.
 * Das bleibt PROJ-80-β vorbehalten, das zurückgestellt ist, weil das DMS in
 * Produktion leer ist.
 *
 * Alle Abfragen laufen über den **sitzungsgebundenen** Client — die
 * Zugriffsregeln des Aufrufers entscheiden, was in den Kontext kommt. Ein
 * Dienst-Schlüssel würde hier Inhalte einsammeln, die der Fragende gar nicht
 * sehen darf, und sie ihm über die Antwort zuspielen.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  ProjectChatAutoContext,
  ProjectChatHistoryMessage,
} from "./types"

/** Obergrenzen. Der Verlauf ist wichtiger als eine lange Aufgabenliste. */
export const CHAT_MAX_WORK_ITEMS = 25
export const CHAT_MAX_PHASES = 20
export const CHAT_MAX_HISTORY = 30

// `phases` sortiert nach `sequence_number`, NICHT `position` — der erste
// Entwurf hatte den falschen Namen. Der Schema-Drift-Waechter prueft nur
// `.select()`-Spalten, keine `.order()`-Argumente; hier haette also erst die
// Laufzeit gemeckert. Gefunden, weil ich die gelesenen Spalten nach dem
// Waechter-Fund vollstaendig gegen das Schema geprueft habe statt nur die
// gemeldete.

export async function collectProjectChatContext(
  supabase: SupabaseClient,
  projectId: string,
  history: ProjectChatHistoryMessage[],
  skills: { name: string; instructions: string }[],
): Promise<ProjectChatAutoContext | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description, project_type, project_method, lifecycle_status")
    .eq("id", projectId)
    .maybeSingle()

  // Kein Projekt sichtbar → kein Kontext. Der Aufrufer macht daraus ein 404;
  // eine Chat-Antwort ohne Projektbezug wäre gegen Lock L1.
  if (!project) return null

  const { data: phases } = await supabase
    .from("phases")
    .select("name, status")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("sequence_number", { ascending: true })
    .limit(CHAT_MAX_PHASES)

  // `count: "exact"` liefert die WAHRE Zahl, auch wenn wir nur die ersten
  // Zeilen mitnehmen — sonst behauptete der Kontext Vollständigkeit
  // (AC-151.6 zusammen mit Edge Case 5).
  const { data: workItems, count } = await supabase
    .from("work_items")
    .select("title, status, due_date", { count: "exact" })
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .not("status", "in", "(done,cancelled)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(CHAT_MAX_WORK_ITEMS)

  const trimmedHistory = history.slice(-CHAT_MAX_HISTORY)

  return {
    project: {
      id: project.id as string,
      name: project.name as string,
      description: (project.description as string | null) ?? null,
      project_type: (project.project_type as string | null) ?? null,
      project_method: (project.project_method as string | null) ?? null,
      lifecycle_status: (project.lifecycle_status as string | null) ?? null,
    },
    phases: (phases ?? []).map((p) => ({
      name: p.name as string,
      status: (p.status as string | null) ?? null,
    })),
    open_work_items: (workItems ?? []).map((w) => ({
      title: w.title as string,
      status: w.status as string,
      due_date: (w.due_date as string | null) ?? null,
    })),
    open_work_items_total: count ?? (workItems?.length ?? 0),
    history: trimmedHistory,
    history_truncated: history.length > trimmedHistory.length,
    // Zusatzanweisung, kein Ersatz — der Grundauftrag steht im Runner (Q4).
    skill_instructions:
      skills.length > 0 ? skills.map((s) => s.instructions).join("\n\n") : null,
    skill_names: skills.map((s) => s.name),
  }
}
