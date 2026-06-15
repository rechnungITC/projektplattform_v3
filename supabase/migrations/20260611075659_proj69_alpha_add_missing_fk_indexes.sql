-- PROJ-69 alpha: add missing FK indexes (Phase-1 class 'a' triage, docs/db-index-audit-2026-05-30.md)
-- Fresh advisor refresh 2026-06-10: 109 unindexed_foreign_keys INFO; 18 class-a from triage
-- + 1 new class-a from PROJ-47 tables post-triage (jira_export_log.project_id).
-- Plain CREATE INDEX (no CONCURRENTLY): all tables are pilot-scale (<< 100k rows).

create index if not exists assistant_action_events_session_id_idx on public.assistant_action_events (session_id);
create index if not exists assistant_action_events_turn_id_idx on public.assistant_action_events (turn_id);
create index if not exists assistant_turns_project_id_idx on public.assistant_turns (project_id);
create index if not exists assistant_turns_wizard_draft_id_idx on public.assistant_turns (wizard_draft_id);
create index if not exists budget_items_category_id_idx on public.budget_items (category_id);
create index if not exists budget_postings_project_id_idx on public.budget_postings (project_id);
create index if not exists compliance_trigger_log_tag_id_idx on public.compliance_trigger_log (tag_id);
create index if not exists context_sources_project_id_idx on public.context_sources (project_id);
create index if not exists decisions_decider_stakeholder_id_idx on public.decisions (decider_stakeholder_id);
create index if not exists decisions_context_phase_id_idx on public.decisions (context_phase_id);
create index if not exists decisions_context_risk_id_idx on public.decisions (context_risk_id);
create index if not exists open_items_contact_stakeholder_id_idx on public.open_items (contact_stakeholder_id);
create index if not exists organization_units_location_id_idx on public.organization_units (location_id);
create index if not exists organization_units_parent_id_idx on public.organization_units (parent_id);
create index if not exists resources_linked_user_id_idx on public.resources (linked_user_id);
create index if not exists resources_source_stakeholder_id_idx on public.resources (source_stakeholder_id);
create index if not exists stakeholder_coaching_recommendations_ki_run_id_idx on public.stakeholder_coaching_recommendations (ki_run_id);
create index if not exists stakeholder_coaching_recommendations_project_id_idx on public.stakeholder_coaching_recommendations (project_id);
-- post-triage addition (PROJ-47, classified 2026-06-10 per same rules: project_id domain FK)
create index if not exists jira_export_log_project_id_idx on public.jira_export_log (project_id);
