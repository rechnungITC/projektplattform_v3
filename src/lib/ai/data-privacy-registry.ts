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

  // -------------------- resources (PROJ-11) ------------------------------
  // All resource fields are personal data — the resource IS a person (or
  // a named external party). Even FTE/availability is HR-relevant and
  // never leaves the local LLM path. Allocations are linkage data — Class 2.
  "resources.display_name": 3,
  "resources.kind": 1,
  "resources.fte_default": 3,
  "resources.availability_default": 3,
  "resources.is_active": 1,
  "resources.linked_user_id": 3,
  "resources.source_stakeholder_id": 3,
  "resource_availabilities.start_date": 2,
  "resource_availabilities.end_date": 2,
  "resource_availabilities.fte": 3,
  "resource_availabilities.note": 3,
  "work_item_resources.allocation_pct": 2,

  // -------------------- vendors (PROJ-15) -------------------------------
  // Vendor as an organization is Class 2 business-context — not personal
  // data. The contact email IS personal data → Class 3.
  "vendors.name": 2,
  "vendors.category": 2,
  "vendors.primary_contact_email": 3,
  "vendors.website": 1,
  "vendors.status": 1,
  "vendor_project_assignments.role": 1,
  "vendor_project_assignments.scope_note": 2,
  "vendor_project_assignments.valid_from": 2,
  "vendor_project_assignments.valid_until": 2,
  "vendor_evaluations.criterion": 2,
  "vendor_evaluations.score": 1,
  // Comment may quote personal observations → conservative Class 3.
  "vendor_evaluations.comment": 3,
  "vendor_documents.kind": 1,
  "vendor_documents.title": 2,
  "vendor_documents.external_url": 2,
  "vendor_documents.note": 2,

  // -------------------- budget (PROJ-22) --------------------------------
  // Budget structure is business context (Class 2) — amounts and currency
  // are projektrelevant aber nicht personenbezogen. Buchungs-Notizen sind
  // Class-3, weil sie Personen explizit erwähnen können ("Bonus für Frau
  // Müller", "Beratungs-Tag mit Hr. Schmidt"). PROJ-12-Routing leitet
  // Class-3 nie an externe Modelle.
  "budget_categories.name": 2,
  "budget_categories.description": 2,
  "budget_items.name": 2,
  "budget_items.description": 2,
  "budget_items.planned_amount": 2,
  "budget_items.planned_currency": 1,
  "budget_items.is_active": 1,
  "budget_postings.kind": 1,
  "budget_postings.amount": 2,
  "budget_postings.currency": 1,
  "budget_postings.posted_at": 2,
  "budget_postings.source": 1,
  // Buchungs-Notiz: PII-Risiko durch freien Text → Class 3.
  "budget_postings.note": 3,
  // Vendor-Rechnung: Nummer + Datum + Betrag sind Geschäftskontext.
  // Notiz kann personenbezogene Anmerkungen enthalten → Class 3.
  "vendor_invoices.invoice_number": 1,
  "vendor_invoices.invoice_date": 2,
  "vendor_invoices.gross_amount": 2,
  "vendor_invoices.currency": 1,
  "vendor_invoices.note": 3,
  // FX-Raten sind reine Marktdaten — Class 1.
  "fx_rates.from_currency": 1,
  "fx_rates.to_currency": 1,
  "fx_rates.rate": 1,
  "fx_rates.valid_on": 2,
  "fx_rates.source": 1,
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
