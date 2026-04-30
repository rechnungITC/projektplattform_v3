/**
 * PROJ-18 — Compliance Automatik types.
 *
 * The trigger engine + UI both share these types. They mirror the DB shape
 * for `compliance_tags`, `work_item_tags`, `compliance_trigger_log`, and
 * `work_item_documents`, plus the in-memory Template / ChildTask shapes that
 * never live in the DB (templates are TS constants per the locked design
 * decision in /architecture).
 */

import type { WorkItemKind } from "@/types/work-item"

export type ComplianceTagKey =
  | "iso-9001"
  | "iso-27001"
  | "dsgvo"
  | "microsoft-365-intro"
  | "vendor-evaluation"
  | "change-management"
  | "onboarding"

export const PLATFORM_DEFAULT_TAG_KEYS: readonly ComplianceTagKey[] = [
  "iso-9001",
  "iso-27001",
  "dsgvo",
  "microsoft-365-intro",
  "vendor-evaluation",
  "change-management",
  "onboarding",
] as const

export type CompliancePhase = "created" | "in_progress" | "done"

export const COMPLIANCE_PHASES: readonly CompliancePhase[] = [
  "created",
  "in_progress",
  "done",
] as const

export interface ComplianceTag {
  id: string
  tenant_id: string
  key: string
  display_name: string
  description: string | null
  is_active: boolean
  default_child_kinds: WorkItemKind[]
  template_keys: string[]
  is_platform_default: boolean
  created_at: string
  updated_at: string
}

export interface WorkItemTagRow {
  id: string
  tenant_id: string
  work_item_id: string
  tag_id: string
  created_by: string
  created_at: string
}

export interface ComplianceTriggerLogRow {
  id: string
  tenant_id: string
  work_item_id: string
  tag_id: string
  phase: CompliancePhase
  fired_at: string
}

export type WorkItemDocumentKind = "compliance-form" | "manual-attachment"

export interface ChecklistItem {
  /** Stable key inside the template, used by the UI to track checked state. */
  key: string
  /** Human-readable instruction. */
  label: string
  /** Optional German hint shown as muted text under the label. */
  hint?: string
}

export interface WorkItemDocument {
  id: string
  tenant_id: string
  work_item_id: string
  kind: WorkItemDocumentKind
  title: string
  body: string
  checklist: ChecklistItem[]
  version: number
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * In-memory template shape — lives in `templates.ts` as a TS constant.
 * Never persisted directly; the trigger engine renders these into
 * `work_item_documents` rows.
 */
export interface ComplianceTemplate {
  /** Unique key, listed in `compliance_tags.template_keys`. */
  key: string
  /** Default title for the produced `work_item_documents` row. */
  title: string
  /**
   * Default child task kind. Trigger creates one child work-item with this
   * kind; document is attached to that child.
   */
  childKind: WorkItemKind
  /** Default child title. */
  childTitle: string
  /** Default child description (Markdown allowed). */
  childDescription: string
  /** Phase to fire on — usually "created" so the child appears immediately. */
  firePhase: CompliancePhase
  /** Initial body text rendered into `work_item_documents.body`. */
  body: string
  /** Initial checklist items. */
  checklist: ChecklistItem[]
}

/**
 * Output of the trigger engine — describes what the API route should
 * create, in dependency order. Idempotency is enforced at insert-time
 * via the UNIQUE(work_item_id, tag_id, phase) constraint on
 * `compliance_trigger_log`.
 */
export interface TriggerEffect {
  tagId: string
  tagKey: string
  phase: CompliancePhase
  /** Templates to render. May be empty if the tag has no template_keys. */
  templates: ComplianceTemplate[]
}

export interface ComplianceWarning {
  /** The phase the parent is transitioning to (or just transitioned to). */
  phase: CompliancePhase
  tagKey: string
  /** What's missing. */
  message: string
  /** Optional template key the user should consider applying. */
  suggestedTemplateKey?: string
}
