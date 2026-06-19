-- ---------------------------------------------------------------------------
-- PROJ-100a — H-1 fix (QA 2026-06-18): allow 'ma_confidentiality_clearances'
-- in audit_log_entries.entity_type.
--
-- The PROJ-100a migration (20260616100000) made grant_/revoke_confidentiality_
-- clearance write an audit_log_entries row with
--   entity_type = 'ma_confidentiality_clearances'
-- but never extended the audit_log_entity_type_check CHECK constraint to allow
-- that value. Result: every AUTHORIZED grant/revoke aborted with
--   ERROR 23514 ... violates check constraint "audit_log_entity_type_check"
-- -> the clearance table could never be populated via the supported RPC/API,
-- and AC3 (audit of every grant/revoke) was unprovable. (Fails closed: no leak,
-- but the feature's write path was non-functional in prod.)
--
-- This fix re-creates the constraint with the new entity type appended. The
-- list is the deployed set (44 values) + 'ma_confidentiality_clearances'.
-- ---------------------------------------------------------------------------

alter table public.audit_log_entries
  drop constraint if exists audit_log_entity_type_check;

alter table public.audit_log_entries
  add constraint audit_log_entity_type_check check (
    entity_type = any (array[
      'stakeholders','work_items','phases','milestones','projects','risks',
      'decisions','open_items','tenants','tenant_settings','communication_outbox',
      'resources','work_item_resources','tenant_project_type_overrides',
      'tenant_method_overrides','vendors','vendor_project_assignments',
      'vendor_evaluations','vendor_documents','compliance_tags',
      'work_item_documents','budget_categories','budget_items','budget_postings',
      'vendor_invoices','report_snapshots','role_rates','work_item_cost_lines',
      'dependencies','tenant_ai_keys','tenant_ai_providers',
      'tenant_ai_provider_priority','tenant_ai_cost_caps','tenant_memberships',
      'organization_units','locations','stakeholder_interactions',
      'stakeholder_interaction_participants','organization_imports','releases',
      'stakeholder_coaching_recommendations','project_goals','sprints','risk_links',
      'ma_confidentiality_clearances'
    ]::text[])
  );