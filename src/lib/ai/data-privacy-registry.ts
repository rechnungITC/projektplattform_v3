/**
 * PROJ-12 — field-level data-privacy classification (V3 port of V2's
 * `data_privacy.py`).
 *
 *   1 = public/non-personal (technical metadata, enums, ids)
 *   2 = internal business context (work-domain freetext / dates / names of
 *       things, not of people)
 *   3 = personal data (GDPR-relevant; never leaves the local LLM path)
 *
 * The registry is keyed by `table.column`. Anything NOT in the registry
 * defaults to class 3 — the safe direction. Adding a new column requires
 * an explicit classification entry; otherwise the field is treated as
 * personal data and routed only to local providers.
 */

import type { DataClass } from "./types"

const REGISTRY: Record<string, DataClass> = {
  // -------------------- projects ----------------------------------------
  "projects.name": 2,
  "projects.description": 2,
  "projects.project_number": 1,
  "projects.project_type": 1,
  "projects.project_method": 1,
  "projects.lifecycle_status": 1,
  "projects.planned_start_date": 2,
  "projects.planned_end_date": 2,
  "projects.responsible_user_id": 3,
  "projects.type_specific_data": 2,

  // -------------------- phases ------------------------------------------
  "phases.name": 1,
  "phases.description": 2,
  "phases.planned_start": 2,
  "phases.planned_end": 2,
  "phases.status": 1,
  "phases.sequence_number": 1,

  // -------------------- milestones --------------------------------------
  "milestones.name": 1,
  "milestones.description": 2,
  "milestones.target_date": 2,
  "milestones.actual_date": 2,
  "milestones.status": 1,

  // -------------------- work_items --------------------------------------
  "work_items.title": 2,
  "work_items.description": 2,
  "work_items.status": 1,
  "work_items.priority": 1,
  "work_items.kind": 1,
  "work_items.story_points": 1,
  "work_items.responsible_user_id": 3,

  // -------------------- risks (no personal data by design) --------------
  "risks.title": 2,
  "risks.description": 2,
  "risks.probability": 1,
  "risks.impact": 1,
  "risks.status": 1,
  "risks.mitigation": 2,
  "risks.responsible_user_id": 3,

  // -------------------- decisions ---------------------------------------
  "decisions.title": 2,
  "decisions.decision_text": 2,
  "decisions.rationale": 2,
  "decisions.decided_at": 2,
  "decisions.is_revised": 1,

  // -------------------- open_items --------------------------------------
  "open_items.title": 2,
  "open_items.description": 2,
  "open_items.status": 1,
  "open_items.contact": 3,
  "open_items.contact_stakeholder_id": 3,

  // -------------------- stakeholders (all personal) ---------------------
  "stakeholders.name": 3,
  "stakeholders.contact_email": 3,
  "stakeholders.contact_phone": 3,
  "stakeholders.linked_user_id": 3,
  "stakeholders.notes": 3,
  "stakeholders.role_key": 2,
  "stakeholders.org_unit": 2,
  "stakeholders.kind": 1,
  "stakeholders.origin": 1,
  "stakeholders.influence": 1,
  "stakeholders.impact": 1,
  "stakeholders.is_active": 1,

  // -------------------- profiles (all personal) -------------------------
  "profiles.email": 3,
  "profiles.full_name": 3,

  // -------------------- audit_log_entries -------------------------------
  "audit_log_entries.entity_type": 1,
  "audit_log_entries.field_name": 1,
  "audit_log_entries.actor_user_id": 3,
  "audit_log_entries.changed_at": 2,
  "audit_log_entries.change_reason": 1,

  // -------------------- communication_outbox (PROJ-13) ------------------
  // recipient + subject + body are PII by default — the audience and the
  // free-text body can name people, emails, etc. Class-3-by-default so
  // that PROJ-17's tenant export redacts them and PROJ-12 KI cannot pull
  // outbox content into external models without explicit override.
  "communication_outbox.recipient": 3,
  "communication_outbox.subject": 3,
  "communication_outbox.body": 3,
  "communication_outbox.channel": 1,
  "communication_outbox.status": 1,
  "communication_outbox.error_detail": 2,
  "communication_outbox.sent_at": 2,
}

/**
 * Resolve the privacy class for a single `<table>.<column>` reference.
 *
 * `tenantDefault` (PROJ-17) overrides the system fallback for *unknown*
 * fields only — known Class-3 entries always stay Class 3. The tenant
 * cannot deklassify a registered field, only relax the safety net for
 * fields the registry doesn't list yet.
 *
 * System default (no tenant override): 3.
 */
export function classifyField(
  table: string,
  column: string,
  tenantDefault: DataClass = 3
): DataClass {
  const known = REGISTRY[`${table}.${column}`]
  if (known !== undefined) return known
  return tenantDefault
}

/**
 * Total count of classified fields. Useful for sanity-checking that the
 * registry actually loaded.
 */
export function registrySize(): number {
  return Object.keys(REGISTRY).length
}
