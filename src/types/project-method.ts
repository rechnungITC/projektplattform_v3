/**
 * Project method enum — flat list of 7 first-class methods (PROJ-6).
 * Persisted in `projects.project_method` (nullable). NULL means
 * "no method chosen yet"; once set, the method is hard-locked
 * (DB trigger `enforce_method_immutable`). Sub-projects under a
 * parent project may pick a different method.
 *
 * The V2 split into "active methods" (4) + "templates" (3) is
 * superseded by this design: PMI, PRINCE2, VXT2 are first-class.
 */
export type ProjectMethod =
  | "scrum"
  | "kanban"
  | "safe"
  | "waterfall"
  | "pmi"
  | "prince2"
  | "vxt2"

export const PROJECT_METHODS: readonly ProjectMethod[] = [
  "scrum",
  "kanban",
  "safe",
  "waterfall",
  "pmi",
  "prince2",
  "vxt2",
] as const

export const PROJECT_METHOD_LABELS: Record<ProjectMethod, string> = {
  scrum: "Scrum",
  kanban: "Kanban",
  safe: "SAFe",
  waterfall: "Wasserfall",
  pmi: "PMI",
  prince2: "PRINCE2",
  vxt2: "VXT 2.0",
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
  prince2:
    "Strukturierte Phasenübergänge, formale Freigaben, Lenkungsausschuss.",
  vxt2: "Hybrid aus Wasserfall-Phasen oben und agilem Arbeiten in den Teams.",
}

/**
 * The leading planning objects per method — what a project of this
 * method is "about". Used by the rule engine to derive starter_kinds.
 */
export const PROJECT_METHOD_LEAD_OBJECTS: Record<ProjectMethod, string[]> = {
  scrum: ["Epic", "Story", "Task", "Subtask", "Bug"],
  kanban: ["Story", "Task", "Bug"],
  safe: ["Epic", "Feature", "Story", "Task", "Subtask", "Bug"],
  waterfall: ["Phase", "Meilenstein", "Arbeitspaket"],
  pmi: ["Phase", "Meilenstein", "Arbeitspaket"],
  prince2: ["Phase", "Meilenstein", "Arbeitspaket"],
  vxt2: ["Phase", "Story", "Task", "Arbeitspaket"],
}

/**
 * True when a project has explicitly committed to a method (i.e. the
 * method is not NULL). Useful for warnings and lock indicators.
 */
export function isMethodSet(
  method: ProjectMethod | null | undefined
): method is ProjectMethod {
  return method != null
}
