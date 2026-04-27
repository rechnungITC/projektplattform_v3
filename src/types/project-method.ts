/**
 * Project method enum — placeholder until PROJ-7 ships
 * `projects.project_method`. Once that lands, the project row exposes
 * the value and `getCurrentMethod()` in `@/lib/work-items/method-context`
 * will read it.
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
