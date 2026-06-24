/**
 * Project type catalog (PROJ-6) — code-registry source of truth for the
 * 4 initial project types. Contributes standard roles, modules, and
 * required-info questions per type. Drives the wizard and the rule engine.
 *
 * The catalog is global. Tenant-level overrides come with PROJ-16
 * (`tenant_project_type_overrides` table). Construction is intentionally
 * shallow — placeholder until the construction extension lands.
 */

import type { ComplianceTagKey } from "@/lib/compliance/types"
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
   * PROJ-18 ST-05: compliance tag keys auto-attached when creating a
   * project of this type. Tenant overrides may replace this list.
   */
  default_tag_keys: readonly ComplianceTagKey[]
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
  default_tag_keys: ["iso-9001", "vendor-evaluation", "dsgvo"],
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
  default_tag_keys: ["iso-27001", "change-management"],
}

const GENERAL_PROFILE: ProjectTypeProfile = {
  key: "general",
  label_de: "Allgemein",
  summary_de:
    "Pragmatischer Standard für Projekte, die in keine andere Kategorie passen.",
  standard_roles: [ROLE_PL, ROLE_SPONSOR],
  standard_modules: ["backlog", "planning", "members", "history"],
  required_info: [],
  default_tag_keys: [],
}

const CONSTRUCTION_PROFILE: ProjectTypeProfile = {
  key: "construction",
  label_de: "Bauprojekt",
  summary_de:
    "Strukturell vorbereitet, fachliche Vertiefung folgt mit der Construction-Extension.",
  standard_roles: [ROLE_PL, ROLE_SPONSOR],
  standard_modules: ["backlog", "planning", "members", "history"],
  required_info: [],
  default_tag_keys: ["iso-9001"],
  is_placeholder: true,
}

// PROJ-97a — M&A standard professional roles ("Fachrollen"). Single source of
// truth: the project-type catalog (PROJ-6). The role is carried by a
// `stakeholders.role_key` slot, NOT by RBAC (`project_memberships.role` stays
// the technical identity — CLAUDE.md Invariante #4). "extern" is the existing
// `stakeholders.origin='external'`, not a role. The editable-list / template
// pre-fill (A3) is deferred to PROJ-96; this stays a code constant.
export const MA_STANDARD_ROLES: readonly StandardRole[] = [
  { key: "executive_sponsor", label_de: "Executive Sponsor" },
  { key: "deal_lead", label_de: "Deal Lead (Corporate Development)" },
  { key: "pmo_lead", label_de: "PMO-Lead" },
  { key: "cfo_finance", label_de: "CFO / Finance" },
  { key: "legal_counsel", label_de: "Legal Counsel" },
  { key: "tax_advisor", label_de: "Tax" },
  { key: "hr_lead", label_de: "HR" },
  { key: "it_lead", label_de: "IT" },
  { key: "communications", label_de: "Communications" },
  { key: "external_advisor", label_de: "Externer Berater" },
  { key: "target_management", label_de: "Target Management" },
]

const MA_ROLE_KEY_SET: ReadonlySet<string> = new Set(
  MA_STANDARD_ROLES.map((r) => r.key)
)

/** PROJ-97a — validates a stakeholder role_key against the M&A role list. */
export function isValidMaRoleKey(key: string): boolean {
  return MA_ROLE_KEY_SET.has(key)
}

// PROJ-94 — M&A is ONE project_type (ma-domain-architecture ADR Fork 1). The
// stored slug is 'ma' (URL-safe); the deal variant (buy/sell/jv/carve-out) is
// the `deal_side` FIELD on ma_project_profiles, not a separate type. The
// strategic foundation (rationale, search profile, …) lives in that extension
// table, so the catalog's required_info stays light — the dedicated wizard
// "M&A-Grundlage" step collects the rich fields.
const MA_PROFILE: ProjectTypeProfile = {
  key: "ma",
  label_de: "M&A-Projekt",
  summary_de:
    "Mergers & Acquisitions / Deal-Lifecycle. Strategische Grundlage, Mandat, Need-to-Know-Vertraulichkeit.",
  // PROJ-97a — extended 4 → 11 M&A professional roles.
  standard_roles: MA_STANDARD_ROLES,
  standard_modules: [
    "backlog",
    "planning",
    "members",
    "history",
    "stakeholders",
    "governance",
  ],
  required_info: [],
  default_tag_keys: ["dsgvo"],
}

const CATALOG_BY_KEY: Record<ProjectType, ProjectTypeProfile> = {
  general: GENERAL_PROFILE,
  erp: ERP_PROFILE,
  software: SOFTWARE_PROFILE,
  construction: CONSTRUCTION_PROFILE,
  ma: MA_PROFILE,
}

export const PROJECT_TYPE_CATALOG: readonly ProjectTypeProfile[] =
  PROJECT_TYPES.map((key) => CATALOG_BY_KEY[key])

export function getProjectTypeProfile(
  type: ProjectType
): ProjectTypeProfile {
  return CATALOG_BY_KEY[type]
}
