/**
 * Project type catalog (PROJ-6) — code-registry source of truth for the
 * 4 initial project types. Contributes standard roles, modules, and
 * required-info questions per type. Drives the wizard and the rule engine.
 *
 * The catalog is global. Tenant-level overrides come with PROJ-16
 * (`tenant_project_type_overrides` table). Construction is intentionally
 * shallow — placeholder until the construction extension lands.
 */

import { PROJECT_TYPES, type ProjectType } from "@/types/project"

/**
 * Module keys mirror the Project Room tabs / sections (PROJ-7). Adding
 * a new module here without wiring the corresponding tab is a no-op
 * for the user and surfaces only as `active_modules` in the rule engine
 * output (consumers decide whether to render it).
 */
export type ProjectModule =
  | "backlog"
  | "planning"
  | "members"
  | "history"
  | "stakeholders"
  | "governance"
  | "releases"

/**
 * Standardized role keys reused across types so stakeholder rollups
 * (PROJ-8) and RBAC defaults (PROJ-4) stay consistent.
 */
export interface StandardRole {
  key: string
  label_de: string
  description_de?: string
}

/**
 * Required info questions are project-type-specific fields that the
 * wizard (PROJ-5) asks the user when creating a project of this type.
 */
export interface RequiredInfo {
  key: string
  label_de: string
  description_de?: string
}

export interface ProjectTypeProfile {
  key: ProjectType
  label_de: string
  summary_de: string
  standard_roles: readonly StandardRole[]
  standard_modules: readonly ProjectModule[]
  required_info: readonly RequiredInfo[]
  /**
   * When true, the type is structurally available but lacks deep domain
   * support (e.g. construction). UIs should show a banner.
   */
  is_placeholder?: boolean
}

// ---------------------------------------------------------------------------
// Catalog entries
// ---------------------------------------------------------------------------

const ROLE_PL: StandardRole = {
  key: "project_lead",
  label_de: "Projektleiter:in",
}
const ROLE_SPONSOR: StandardRole = { key: "sponsor", label_de: "Sponsor" }
const ROLE_KEY_USER: StandardRole = { key: "key_user", label_de: "Key-User" }
const ROLE_IT_ARCHITECT: StandardRole = {
  key: "it_architect",
  label_de: "IT-Architekt:in",
}
const ROLE_DSB: StandardRole = {
  key: "dpo",
  label_de: "Datenschutzbeauftragte:r",
}
const ROLE_PRODUCT_OWNER: StandardRole = {
  key: "product_owner",
  label_de: "Product Owner",
}
const ROLE_SCRUM_MASTER: StandardRole = {
  key: "scrum_master",
  label_de: "Scrum Master",
}
const ROLE_DEVELOPER: StandardRole = { key: "developer", label_de: "Developer" }
const ROLE_QA_LEAD: StandardRole = { key: "qa_lead", label_de: "QA-Lead" }

const ERP_PROFILE: ProjectTypeProfile = {
  key: "erp",
  label_de: "ERP-Projekt",
  summary_de:
    "ERP-Einführung oder -Migration. Fokus auf Fachbereiche, Migration und Datenschutz.",
  standard_roles: [
    ROLE_PL,
    ROLE_SPONSOR,
    ROLE_KEY_USER,
    ROLE_IT_ARCHITECT,
    ROLE_DSB,
  ],
  standard_modules: [
    "backlog",
    "planning",
    "members",
    "history",
    "stakeholders",
    "governance",
  ],
  required_info: [
    {
      key: "target_systems",
      label_de: "Zielsysteme",
      description_de: "Welche ERP-Systeme sind im Scope (z. B. SAP, MS Dynamics)?",
    },
    {
      key: "business_units",
      label_de: "Fachbereiche",
      description_de: "Betroffene Fachbereiche / Standorte.",
    },
    {
      key: "migration_scope",
      label_de: "Migrationsumfang",
      description_de: "Daten- und Prozessmigration aus dem Altsystem.",
    },
  ],
}

const SOFTWARE_PROFILE: ProjectTypeProfile = {
  key: "software",
  label_de: "Software-Projekt",
  summary_de: "Generisches Software-Projekt — Web, Mobile, Backend, Plattform.",
  standard_roles: [
    ROLE_PL,
    ROLE_PRODUCT_OWNER,
    ROLE_SCRUM_MASTER,
    ROLE_DEVELOPER,
    ROLE_QA_LEAD,
  ],
  standard_modules: ["backlog", "planning", "members", "history", "releases"],
  required_info: [
    {
      key: "target_platforms",
      label_de: "Zielplattformen",
      description_de: "Web / iOS / Android / Backend / sonstige.",
    },
    {
      key: "tech_stack",
      label_de: "Technologie-Stack",
      description_de: "Eingesetzte Frameworks, Sprachen, Cloud-Provider.",
    },
  ],
}

const GENERAL_PROFILE: ProjectTypeProfile = {
  key: "general",
  label_de: "Allgemein",
  summary_de:
    "Pragmatischer Standard für Projekte, die in keine andere Kategorie passen.",
  standard_roles: [ROLE_PL, ROLE_SPONSOR],
  standard_modules: ["backlog", "planning", "members", "history"],
  required_info: [],
}

const CONSTRUCTION_PROFILE: ProjectTypeProfile = {
  key: "construction",
  label_de: "Bauprojekt",
  summary_de:
    "Strukturell vorbereitet, fachliche Vertiefung folgt mit der Construction-Extension.",
  standard_roles: [ROLE_PL, ROLE_SPONSOR],
  standard_modules: ["backlog", "planning", "members", "history"],
  required_info: [],
  is_placeholder: true,
}

const CATALOG_BY_KEY: Record<ProjectType, ProjectTypeProfile> = {
  general: GENERAL_PROFILE,
  erp: ERP_PROFILE,
  software: SOFTWARE_PROFILE,
  construction: CONSTRUCTION_PROFILE,
}

export const PROJECT_TYPE_CATALOG: readonly ProjectTypeProfile[] =
  PROJECT_TYPES.map((key) => CATALOG_BY_KEY[key])

export function getProjectTypeProfile(
  type: ProjectType
): ProjectTypeProfile {
  return CATALOG_BY_KEY[type]
}
