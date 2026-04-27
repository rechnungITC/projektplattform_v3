/**
 * Project method enum — drives the method-aware rendering of the
 * Project Room shell (PROJ-7). Persisted in `projects.project_method`
 * once the backend migration lands; the frontend gracefully degrades
 * to `'general'` when the column is missing.
 *
 * `general` means "method not yet decided" — all kinds are creatable so
 * the user can structure freely before committing.
 */
export type ProjectMethod =
  | "scrum"
  | "kanban"
  | "safe"
  | "waterfall"
  | "pmi"
  | "general"

export const PROJECT_METHODS: readonly ProjectMethod[] = [
  "scrum",
  "kanban",
  "safe",
  "waterfall",
  "pmi",
  "general",
] as const

export const PROJECT_METHOD_LABELS: Record<ProjectMethod, string> = {
  scrum: "Scrum",
  kanban: "Kanban",
  safe: "SAFe",
  waterfall: "Wasserfall",
  pmi: "PMI",
  general: "Allgemein",
}

/**
 * Short human-readable description per method — used in tooltips
 * and the create-project method picker.
 */
export const PROJECT_METHOD_DESCRIPTIONS: Record<ProjectMethod, string> = {
  scrum: "Sprints, Stories und Tasks. Backlog-Board als Standardansicht.",
  kanban: "Pull-System mit Stories und Tasks ohne Sprints.",
  safe: "Skalierter Agile-Ansatz mit Epics, Features und Stories.",
  waterfall: "Sequenzielle Phasen mit Arbeitspaketen und Abhängigkeiten.",
  pmi: "Phasen-Gates mit Arbeitspaketen, Meilensteinen und Gantt.",
  general:
    "Pragmatischer Mix aus Phasen und Backlog. Methode später wechselbar.",
}

/**
 * True when the method is anything other than `'general'` — i.e. the
 * project has explicitly committed to a method. Useful for warnings
 * ("changing the method may hide existing work items").
 */
export function isMethodSet(method: ProjectMethod): boolean {
  return method !== "general"
}
