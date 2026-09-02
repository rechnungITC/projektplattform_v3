import type { ProjectMethod } from "@/types/project-method"

export type LifecycleStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "canceled"

export type ProjectType = "erp" | "construction" | "software" | "general" | "ma"

export const LIFECYCLE_STATUSES: readonly LifecycleStatus[] = [
  "draft",
  "active",
  "paused",
  "completed",
  "canceled",
] as const

export const PROJECT_TYPES: readonly ProjectType[] = [
  "erp",
  "construction",
  "software",
  "general",
  "ma",
] as const

export const LIFECYCLE_STATUS_LABELS: Record<LifecycleStatus, string> = {
  draft: "Entwurf",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  canceled: "Abgebrochen",
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  erp: "ERP",
  construction: "Bau",
  software: "Software",
  general: "Allgemein",
  ma: "M&A",
}

/**
 * Allowed lifecycle transitions. Source of truth is the DB function
 * `transition_project_status`; this mirror is for UX (action menu rendering).
 */
export const ALLOWED_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  draft: ["active", "canceled"],
  active: ["paused", "completed", "canceled"],
  paused: ["active", "canceled"],
  canceled: ["draft", "active"],
  completed: [],
}

export interface Project {
  id: string
  tenant_id: string
  name: string
  description: string | null
  project_number: string | null
  planned_start_date: string | null
  planned_end_date: string | null
  responsible_user_id: string
  lifecycle_status: LifecycleStatus
  project_type: ProjectType
  /**
   * PROJ-7: Drives the method-aware Project Room shell. Optional / nullable
   * because the column may not yet exist on rows created before the backend
   * migration. Frontend code should default to `'general'` when missing.
   */
  project_method?: ProjectMethod | null
  created_by: string
  created_at: string
  updated_at: string
  is_deleted: boolean
  /**
   * PROJ-155-β.2 — projektweite Schalter.
   *
   * Die Spalte existiert seit langem als `jsonb NOT NULL DEFAULT '{}'`, war aber
   * in Prod ein leerer, ungenutzter Eimer und weder im GET noch in `patchSchema`
   * (im CIA-Pass unter F-1 gemessen). Seit dieser Slice steht sie in der
   * Audit-Whitelist: jede Änderung hinterlässt eine Spur.
   *
   * Bewusst eng typisiert statt `Record<string, unknown>` — ein offener Eimer
   * hätte die Frage „welche Schalter gibt es?" unbeantwortbar gemacht.
   */
  settings?: ProjectSettings | null
}

/** PROJ-155-β.2 — der Inhalt von `projects.settings`. */
export interface ProjectSettings {
  /**
   * Rechnet ein Zug im Gantt die Folgeverschiebungen der Nachfolger?
   *
   * Default **aus**: bei `false` verhält sich das Ziehen genau wie vor β.2
   * (AC-12). Und auch bei `true` wird nicht ungefragt geschrieben — der Schalter
   * entscheidet, ob **gerechnet** wird, die Übernahme bleibt eine Handlung.
   */
  autoScheduleSuccessors?: boolean
}

export interface ProjectLifecycleEvent {
  id: string
  project_id: string
  from_status: LifecycleStatus
  to_status: LifecycleStatus
  comment: string | null
  changed_by: string
  changed_at: string
}

export interface ProjectLifecycleEventWithActor extends ProjectLifecycleEvent {
  actor_display_name: string | null
  actor_email: string | null
}

export interface ProjectWithResponsible extends Project {
  responsible_display_name: string | null
  responsible_email: string | null
}

/**
 * Cursor format: opaque base64-encoded JSON of `{updated_at, id}`.
 * Used for stable cursor pagination ordered by `updated_at DESC, id DESC`.
 */
export interface ProjectListCursor {
  updated_at: string
  id: string
}

export function encodeCursor(cursor: ProjectListCursor): string {
  if (typeof window === "undefined") {
    return Buffer.from(JSON.stringify(cursor), "utf-8").toString("base64")
  }
  return btoa(JSON.stringify(cursor))
}

export function decodeCursor(value: string): ProjectListCursor | null {
  try {
    const json =
      typeof window === "undefined"
        ? Buffer.from(value, "base64").toString("utf-8")
        : atob(value)
    const parsed = JSON.parse(json) as Partial<ProjectListCursor>
    if (
      typeof parsed.updated_at === "string" &&
      typeof parsed.id === "string"
    ) {
      return { updated_at: parsed.updated_at, id: parsed.id }
    }
    return null
  } catch {
    return null
  }
}
