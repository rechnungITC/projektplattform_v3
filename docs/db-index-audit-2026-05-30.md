# DB Index Audit 2026-05-30 - PROJ-69 Phase 1

**Status:** Phase 1 triage completed 2026-05-31
**Source:** read-only production catalog query at 2026-05-31T18:26:20.444337+00:00; original PROJ-69 advisor snapshot from 2026-05-30 reported 102 `unindexed_foreign_keys` + 73 `unused_index` INFOs.
**Scope:** Research only. No DB changes, no migrations, no index drops.

## Executive Summary

| Cluster | Current rows | Phase-1 decision |
|---|---:|---|
| `unindexed_foreign_keys` | 102 | 18 add-index candidates, 84 documented skip decisions |
| `unused_index` non-unique zero-scan indexes | 72 | 7 drop candidates, 58 keep feature-pending, 7 keep admin/cron |
| Zero-scan unique constraints/indexes | 18 | Not drop candidates in Phase 1; uniqueness semantics first |

Note: The live catalog currently shows 72 non-unique zero-scan indexes, while the original Supabase advisor snapshot listed 73 `unused_index` INFOs. This is expected after stats movement or small schema changes between 2026-05-30 and 2026-05-31. Phase 2/3 must refresh `get_advisors(performance)` immediately before migration authoring.

## Classification Rules

| Code | Meaning | Migration impact |
|---|---|---|
| a | Add index | Candidate for PROJ-69 alpha `add_missing_fk_indexes` |
| b | Skip - DELETE rare | Document with comment/audit note; no index in alpha |
| c | Skip - denormalized scan acceptable | Not used in this pass; all current skip rows are tenant/user/audit delete-rare paths |
| alpha | Drop candidate | Candidate for PROJ-69 beta `drop_unused_indexes` after one final advisor refresh |
| beta | Keep - feature-pending | Document as keep; feature is recent/planned or pilot workload not representative |
| gamma | Keep - admin/cron only | Document as keep; idx_scan can stay zero in daily stats |

## Unindexed FK Table Counts

| Table | Findings |
|---|---:|
| `decisions` | 5 |
| `assistant_action_events` | 3 |
| `assistant_turns` | 3 |
| `budget_items` | 3 |
| `budget_postings` | 3 |
| `decision_approval_events` | 3 |
| `open_items` | 3 |
| `resources` | 3 |
| `stakeholder_coaching_recommendations` | 3 |
| `stakeholder_profile_audit_events` | 3 |
| `budget_categories` | 2 |
| `communication_outbox` | 2 |
| `compliance_trigger_log` | 2 |
| `context_sources` | 2 |
| `ki_suggestions` | 2 |
| `milestones` | 2 |
| `organization_imports` | 2 |
| `organization_units` | 2 |
| `phases` | 2 |
| `project_chat_messages` | 2 |
| `risks` | 2 |
| `stakeholder_suggestion_dismissals` | 2 |
| `stakeholders` | 2 |
| `vendor_documents` | 2 |
| `vendor_evaluations` | 2 |
| `vendor_project_assignments` | 2 |
| `work_item_cost_lines` | 2 |
| `work_item_documents` | 2 |
| `work_item_links` | 2 |
| `work_item_resources` | 2 |
| `work_item_tags` | 2 |
| `assistant_sessions` | 1 |
| `decision_approvers` | 1 |
| `fx_rates` | 1 |
| `ki_provenance` | 1 |
| `project_goals` | 1 |
| `project_lifecycle_events` | 1 |
| `project_memberships` | 1 |
| `project_wizard_drafts` | 1 |
| `projects` | 1 |
| `releases` | 1 |
| `resource_availabilities` | 1 |
| `retention_export_log` | 1 |
| `risk_links` | 1 |
| `role_rates` | 1 |
| `sprints` | 1 |
| `stakeholder_interactions` | 1 |
| `stakeholder_personality_profiles` | 1 |
| `stakeholder_self_assessment_invites` | 1 |
| `stakeholder_skill_profiles` | 1 |
| `tenant_ai_cost_caps` | 1 |
| `tenant_ai_provider_priority` | 1 |
| `tenant_ai_providers` | 1 |
| `tenant_method_overrides` | 1 |
| `tenant_project_type_overrides` | 1 |
| `tenant_secrets` | 1 |
| `vendor_invoices` | 1 |
| `vendors` | 1 |
| `work_items` | 1 |

## Unindexed FK Triage

| Class | FK | References | Constraint | Decision | Evidence |
|---|---|---|---|---|---|
| a | `assistant_action_events.session_id` | `assistant_sessions` | `assistant_action_events_session_id_fkey` | Add index | PROJ-37/41 assistant core; domain relation or parent delete path should avoid unbounded child-table scan. |
| a | `assistant_action_events.turn_id` | `assistant_turns` | `assistant_action_events_turn_id_fkey` | Add index | PROJ-37/41 assistant core; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `assistant_action_events.user_id` | `users` | `assistant_action_events_user_id_fkey` | Skip - DELETE rare | PROJ-37/41 assistant core; auth-user delete is rare; assistant reads are tenant/session scoped. |
| b | `assistant_sessions.user_id` | `users` | `assistant_sessions_user_id_fkey` | Skip - DELETE rare | PROJ-37/41 assistant core; auth-user delete is rare; assistant reads are tenant/session scoped. |
| a | `assistant_turns.project_id` | `projects` | `assistant_turns_project_id_fkey` | Add index | PROJ-37/41 assistant core; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `assistant_turns.user_id` | `users` | `assistant_turns_user_id_fkey` | Skip - DELETE rare | PROJ-37/41 assistant core; auth-user delete is rare; assistant reads are tenant/session scoped. |
| a | `assistant_turns.wizard_draft_id` | `project_wizard_drafts` | `assistant_turns_wizard_draft_id_fkey` | Add index | PROJ-37/41 assistant core; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `budget_categories.created_by` | `profiles` | `budget_categories_created_by_fkey` | Skip - DELETE rare | PROJ-22 budget module; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `budget_categories.tenant_id` | `tenants` | `budget_categories_tenant_fkey` | Skip - DELETE rare | PROJ-22 budget module; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `budget_items.category_id` | `budget_categories` | `budget_items_category_fkey` | Add index | PROJ-22 budget module; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `budget_items.created_by` | `profiles` | `budget_items_created_by_fkey` | Skip - DELETE rare | PROJ-22 budget module; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `budget_items.tenant_id` | `tenants` | `budget_items_tenant_fkey` | Skip - DELETE rare | PROJ-22 budget module; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `budget_postings.created_by` | `profiles` | `budget_postings_created_by_fkey` | Skip - DELETE rare | PROJ-22 budget module; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `budget_postings.project_id` | `projects` | `budget_postings_project_fkey` | Add index | PROJ-22 budget module; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `budget_postings.tenant_id` | `tenants` | `budget_postings_tenant_fkey` | Skip - DELETE rare | PROJ-22 budget module; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `communication_outbox.created_by` | `profiles` | `communication_outbox_created_by_fkey` | Skip - DELETE rare | PROJ-13 communication; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `communication_outbox.tenant_id` | `tenants` | `communication_outbox_tenant_fkey` | Skip - DELETE rare | PROJ-13 communication; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `compliance_trigger_log.tag_id` | `compliance_tags` | `ctl_tag_fkey` | Add index | PROJ-18 compliance; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `compliance_trigger_log.tenant_id` | `tenants` | `ctl_tenant_fkey` | Skip - DELETE rare | PROJ-18 compliance; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `context_sources.created_by` | `users` | `context_sources_created_by_fkey` | Skip - DELETE rare | PROJ-44 context sources; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `context_sources.project_id` | `projects` | `context_sources_project_id_fkey` | Add index | PROJ-44 context sources; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `decision_approval_events.actor_stakeholder_id` | `stakeholders` | `decision_approval_events_actor_stakeholder_id_fkey` | Skip - DELETE rare | PROJ-31 approval gates; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `decision_approval_events.actor_user_id` | `users` | `decision_approval_events_actor_user_id_fkey` | Skip - DELETE rare | PROJ-31 approval gates; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `decision_approval_events.tenant_id` | `tenants` | `decision_approval_events_tenant_id_fkey` | Skip - DELETE rare | PROJ-31 approval gates; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `decision_approvers.tenant_id` | `tenants` | `decision_approvers_tenant_id_fkey` | Skip - DELETE rare | PROJ-31 approval gates; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `decisions.created_by` | `profiles` | `decisions_created_by_fkey` | Skip - DELETE rare | PROJ-20 risks/decisions/open items; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `decisions.decider_stakeholder_id` | `stakeholders` | `decisions_decider_fkey` | Add index | PROJ-20 risks/decisions/open items; domain relation or parent delete path should avoid unbounded child-table scan. |
| a | `decisions.context_phase_id` | `phases` | `decisions_phase_fkey` | Add index | PROJ-20 risks/decisions/open items; domain relation or parent delete path should avoid unbounded child-table scan. |
| a | `decisions.context_risk_id` | `risks` | `decisions_risk_fkey` | Add index | PROJ-20 risks/decisions/open items; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `decisions.tenant_id` | `tenants` | `decisions_tenant_fkey` | Skip - DELETE rare | PROJ-20 risks/decisions/open items; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `fx_rates.created_by` | `profiles` | `fx_rates_created_by_fkey` | Skip - DELETE rare | PROJ-24 cost stack; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `ki_provenance.tenant_id` | `tenants` | `ki_provenance_tenant_fkey` | Skip - DELETE rare | PROJ-12 AI provenance; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `ki_suggestions.created_by` | `profiles` | `ki_suggestions_created_by_fkey` | Skip - DELETE rare | PROJ-12 AI provenance; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `ki_suggestions.tenant_id` | `tenants` | `ki_suggestions_tenant_fkey` | Skip - DELETE rare | PROJ-12 AI provenance; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `milestones.created_by` | `profiles` | `milestones_created_by_fkey` | Skip - DELETE rare | PROJ-19 phases/milestones; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `milestones.tenant_id` | `tenants` | `milestones_tenant_id_fkey` | Skip - DELETE rare | PROJ-19 phases/milestones; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `open_items.contact_stakeholder_id` | `stakeholders` | `open_items_contact_fkey` | Add index | PROJ-20 risks/decisions/open items; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `open_items.created_by` | `profiles` | `open_items_created_by_fkey` | Skip - DELETE rare | PROJ-20 risks/decisions/open items; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `open_items.tenant_id` | `tenants` | `open_items_tenant_fkey` | Skip - DELETE rare | PROJ-20 risks/decisions/open items; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `organization_imports.committed_by` | `profiles` | `organization_imports_committed_by_fkey` | Skip - DELETE rare | PROJ-62/63 organization; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `organization_imports.uploaded_by` | `profiles` | `organization_imports_uploaded_by_fkey` | Skip - DELETE rare | PROJ-62/63 organization; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `organization_units.location_id` | `locations` | `organization_units_location_id_fkey` | Add index | PROJ-62/63 organization; domain relation or parent delete path should avoid unbounded child-table scan. |
| a | `organization_units.parent_id` | `organization_units` | `organization_units_parent_id_fkey` | Add index | PROJ-62/63 organization; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `phases.created_by` | `profiles` | `phases_created_by_fkey` | Skip - DELETE rare | PROJ-19 phases/milestones; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `phases.tenant_id` | `tenants` | `phases_tenant_id_fkey` | Skip - DELETE rare | PROJ-19 phases/milestones; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `project_chat_messages.sender_user_id` | `profiles` | `chat_sender_fkey` | Skip - DELETE rare | PROJ-13 communication; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `project_chat_messages.tenant_id` | `tenants` | `chat_tenant_fkey` | Skip - DELETE rare | PROJ-13 communication; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `project_goals.created_by` | `profiles` | `project_goals_created_by_fkey` | Skip - DELETE rare | PROJ-65 trajectory goals; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `project_lifecycle_events.changed_by` | `profiles` | `project_lifecycle_events_changed_by_fkey` | Skip - DELETE rare | PROJ-2 project lifecycle; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `project_memberships.created_by` | `profiles` | `project_memberships_created_by_fkey` | Skip - DELETE rare | PROJ-4 project memberships; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `project_wizard_drafts.created_by` | `profiles` | `pwd_created_by_fkey` | Skip - DELETE rare | PROJ-5 wizard drafts; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `projects.created_by` | `profiles` | `projects_created_by_fkey` | Skip - DELETE rare | PROJ-2 project lifecycle; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `releases.created_by` | `profiles` | `releases_created_by_fkey` | Skip - DELETE rare | PROJ-61 releases; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `resource_availabilities.tenant_id` | `tenants` | `ra_tenant_fkey` | Skip - DELETE rare | PROJ-11/57 resources; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `resources.created_by` | `profiles` | `resources_created_by_fkey` | Skip - DELETE rare | PROJ-11/57 resources; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `resources.linked_user_id` | `profiles` | `resources_linked_user_fkey` | Add index | PROJ-11/57 resources; domain relation or parent delete path should avoid unbounded child-table scan. |
| a | `resources.source_stakeholder_id` | `stakeholders` | `resources_stakeholder_fkey` | Add index | PROJ-11/57 resources; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `retention_export_log.actor_user_id` | `profiles` | `rel_actor_fkey` | Skip - DELETE rare | PROJ-10 audit retention; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `risk_links.created_by` | `profiles` | `risk_links_created_by_fkey` | Skip - DELETE rare | PROJ-65 trajectory/cross-links; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `risks.created_by` | `profiles` | `risks_created_by_fkey` | Skip - DELETE rare | PROJ-20 risks/decisions/open items; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `risks.tenant_id` | `tenants` | `risks_tenant_fkey` | Skip - DELETE rare | PROJ-20 risks/decisions/open items; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `role_rates.created_by` | `profiles` | `role_rates_created_by_fkey` | Skip - DELETE rare | PROJ-54 resource rates; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `sprints.tenant_id` | `tenants` | `sprints_tenant_id_fkey` | Skip - DELETE rare | PROJ-9 sprints; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_coaching_recommendations.created_by` | `profiles` | `stakeholder_coaching_recommendations_created_by_fkey` | Skip - DELETE rare | PROJ-34 stakeholder coaching; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| a | `stakeholder_coaching_recommendations.ki_run_id` | `ki_runs` | `stakeholder_coaching_recommendations_ki_run_id_fkey` | Add index | PROJ-34 stakeholder coaching; domain relation or parent delete path should avoid unbounded child-table scan. |
| a | `stakeholder_coaching_recommendations.project_id` | `projects` | `stakeholder_coaching_recommendations_project_id_fkey` | Add index | PROJ-34 stakeholder coaching; domain relation or parent delete path should avoid unbounded child-table scan. |
| b | `stakeholder_interactions.created_by` | `users` | `stakeholder_interactions_created_by_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_personality_profiles.fremd_assessed_by` | `profiles` | `stakeholder_personality_profiles_fremd_assessed_by_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_profile_audit_events.actor_stakeholder_id` | `stakeholders` | `stakeholder_profile_audit_events_actor_stakeholder_id_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_profile_audit_events.actor_user_id` | `users` | `stakeholder_profile_audit_events_actor_user_id_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_profile_audit_events.tenant_id` | `tenants` | `stakeholder_profile_audit_events_tenant_id_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_self_assessment_invites.created_by` | `users` | `stakeholder_self_assessment_invites_created_by_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_skill_profiles.fremd_assessed_by` | `profiles` | `stakeholder_skill_profiles_fremd_assessed_by_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_suggestion_dismissals.dismissed_by` | `profiles` | `ssd_dismissed_by_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholder_suggestion_dismissals.tenant_id` | `tenants` | `ssd_tenant_fkey` | Skip - DELETE rare | PROJ-34 stakeholder intelligence; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholders.created_by` | `profiles` | `stakeholders_created_by_fkey` | Skip - DELETE rare | PROJ-8 stakeholders; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `stakeholders.tenant_id` | `tenants` | `stakeholders_tenant_id_fkey` | Skip - DELETE rare | PROJ-8 stakeholders; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `tenant_ai_cost_caps.updated_by` | `profiles` | `tenant_ai_cost_caps_updated_by_fkey` | Skip - DELETE rare | PROJ-32 tenant AI providers; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `tenant_ai_provider_priority.updated_by` | `profiles` | `tenant_ai_provider_priority_updated_by_fkey` | Skip - DELETE rare | PROJ-32 tenant AI providers; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `tenant_ai_providers.created_by` | `profiles` | `tenant_ai_providers_created_by_fkey` | Skip - DELETE rare | PROJ-32 tenant AI providers; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `tenant_method_overrides.updated_by` | `profiles` | `tmo_updated_by_fkey` | Skip - DELETE rare | PROJ-16 master data overrides; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `tenant_project_type_overrides.updated_by` | `profiles` | `tpto_updated_by_fkey` | Skip - DELETE rare | PROJ-16 master data overrides; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `tenant_secrets.created_by` | `profiles` | `tenant_secrets_created_by_fkey` | Skip - DELETE rare | PROJ-14 connector secrets; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendor_documents.created_by` | `profiles` | `vd_created_by_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendor_documents.tenant_id` | `tenants` | `vd_tenant_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendor_evaluations.created_by` | `profiles` | `ve_created_by_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendor_evaluations.tenant_id` | `tenants` | `ve_tenant_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendor_invoices.created_by` | `profiles` | `vendor_invoices_created_by_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendor_project_assignments.created_by` | `profiles` | `vpa_created_by_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendor_project_assignments.tenant_id` | `tenants` | `vpa_tenant_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `vendors.created_by` | `profiles` | `vendors_created_by_fkey` | Skip - DELETE rare | PROJ-15 vendor procurement; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_cost_lines.created_by` | `profiles` | `work_item_cost_lines_created_by_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_cost_lines.tenant_id` | `tenants` | `work_item_cost_lines_tenant_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_documents.created_by` | `profiles` | `wid_created_by_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_documents.tenant_id` | `tenants` | `wid_tenant_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_links.approved_by` | `profiles` | `work_item_links_approved_by_fkey` | Skip - DELETE rare | PROJ-65 trajectory/cross-links; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_links.created_by` | `profiles` | `work_item_links_created_by_fkey` | Skip - DELETE rare | PROJ-65 trajectory/cross-links; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_resources.created_by` | `profiles` | `wir_created_by_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_resources.tenant_id` | `tenants` | `wir_tenant_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_tags.created_by` | `profiles` | `wit_created_by_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_item_tags.tenant_id` | `tenants` | `wit_tenant_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |
| b | `work_items.tenant_id` | `tenants` | `work_items_tenant_id_fkey` | Skip - DELETE rare | PROJ-9 work item metamodel; audit-/tenant-FK; parent deletes are offboarding/admin events, not user-path workload. |

## Unused Index Table Counts

| Table | Findings |
|---|---:|
| `project_goals` | 4 |
| `projects` | 4 |
| `stakeholders` | 4 |
| `work_item_links` | 4 |
| `audit_log_entries` | 3 |
| `ki_runs` | 3 |
| `vendor_invoices` | 3 |
| `assistant_action_events` | 2 |
| `assistant_turns` | 2 |
| `decisions` | 2 |
| `dependencies` | 2 |
| `ki_provenance` | 2 |
| `locations` | 2 |
| `organization_units` | 2 |
| `releases` | 2 |
| `sprints` | 2 |
| `stakeholder_coaching_recommendations` | 2 |
| `stakeholder_interactions` | 2 |
| `work_items` | 2 |
| `assistant_sessions` | 1 |
| `budget_items` | 1 |
| `budget_postings` | 1 |
| `communication_outbox` | 1 |
| `context_sources` | 1 |
| `ki_suggestions` | 1 |
| `milestones` | 1 |
| `open_items` | 1 |
| `phases` | 1 |
| `project_wizard_drafts` | 1 |
| `report_snapshots` | 1 |
| `resources` | 1 |
| `retention_export_log` | 1 |
| `risk_links` | 1 |
| `risks` | 1 |
| `stakeholder_interaction_participants` | 1 |
| `stakeholder_personality_profiles` | 1 |
| `stakeholder_self_assessment_invites` | 1 |
| `stakeholder_skill_profiles` | 1 |
| `tenant_memberships` | 1 |
| `tenants` | 1 |
| `work_item_cost_lines` | 1 |
| `work_item_tags` | 1 |

## Unused Index Triage

| Class | Table | Index | Decision | Evidence | Definition |
|---|---|---|---|---|---|
| beta | `assistant_action_events` | `assistant_action_events_project_idx` | Keep - feature-pending | PROJ-37/41 assistant core; recent or low-traffic feature path; keep until pilot workload has representative stats. | `assistant_action_events_project_idx ON assistant_action_events USING btree (project_id, created_at DESC) WHERE (project_id IS NOT NULL)` |
| beta | `assistant_action_events` | `assistant_action_events_tenant_user_idx` | Keep - feature-pending | PROJ-37/41 assistant core; recent or low-traffic feature path; keep until pilot workload has representative stats. | `assistant_action_events_tenant_user_idx ON assistant_action_events USING btree (tenant_id, user_id, created_at DESC)` |
| beta | `assistant_sessions` | `assistant_sessions_project_idx` | Keep - feature-pending | PROJ-37/41 assistant core; recent or low-traffic feature path; keep until pilot workload has representative stats. | `assistant_sessions_project_idx ON assistant_sessions USING btree (project_id) WHERE (project_id IS NOT NULL)` |
| beta | `assistant_turns` | `assistant_turns_session_idx` | Keep - feature-pending | PROJ-37/41 assistant core; recent or low-traffic feature path; keep until pilot workload has representative stats. | `assistant_turns_session_idx ON assistant_turns USING btree (session_id, created_at)` |
| beta | `assistant_turns` | `assistant_turns_tenant_user_idx` | Keep - feature-pending | PROJ-37/41 assistant core; recent or low-traffic feature path; keep until pilot workload has representative stats. | `assistant_turns_tenant_user_idx ON assistant_turns USING btree (tenant_id, user_id, created_at DESC)` |
| gamma | `audit_log_entries` | `audit_log_actor_idx` | Keep - admin/cron only | feature-spec anchor pending; operational, billing, retention, or audit path can miss daily idx_scan windows. | `audit_log_actor_idx ON audit_log_entries USING btree (actor_user_id, changed_at DESC)` |
| gamma | `audit_log_entries` | `audit_log_causation_idx` | Keep - admin/cron only | feature-spec anchor pending; operational, billing, retention, or audit path can miss daily idx_scan windows. | `audit_log_causation_idx ON audit_log_entries USING btree (causation_id, changed_at) WHERE (causation_id IS NOT NULL)` |
| gamma | `audit_log_entries` | `audit_log_tenant_idx` | Keep - admin/cron only | feature-spec anchor pending; operational, billing, retention, or audit path can miss daily idx_scan windows. | `audit_log_tenant_idx ON audit_log_entries USING btree (tenant_id, changed_at DESC)` |
| beta | `budget_items` | `budget_items_project_idx` | Keep - feature-pending | PROJ-22 budget module; recent or low-traffic feature path; keep until pilot workload has representative stats. | `budget_items_project_idx ON budget_items USING btree (project_id, category_id, "position")` |
| beta | `budget_postings` | `budget_postings_source_ref_idx` | Keep - feature-pending | PROJ-22 budget module; recent or low-traffic feature path; keep until pilot workload has representative stats. | `budget_postings_source_ref_idx ON budget_postings USING btree (source_ref_id) WHERE (source_ref_id IS NOT NULL)` |
| gamma | `communication_outbox` | `communication_outbox_project_status_idx` | Keep - admin/cron only | PROJ-13 communication; operational, billing, retention, or audit path can miss daily idx_scan windows. | `communication_outbox_project_status_idx ON communication_outbox USING btree (project_id, status, created_at DESC)` |
| beta | `context_sources` | `context_sources_status_idx` | Keep - feature-pending | PROJ-44 context sources; recent or low-traffic feature path; keep until pilot workload has representative stats. | `context_sources_status_idx ON context_sources USING btree (processing_status) WHERE (processing_status = ANY (ARRAY['pending'::context_source_processing_status, 'processing'::context_source_processing_status, 'failed'::context_source_processing_status]))` |
| beta | `decisions` | `decisions_active_idx` | Keep - feature-pending | PROJ-20 risks/decisions/open items; recent or low-traffic feature path; keep until pilot workload has representative stats. | `decisions_active_idx ON decisions USING btree (project_id, decided_at DESC) WHERE (is_revised = false)` |
| beta | `decisions` | `decisions_supersedes_idx` | Keep - feature-pending | PROJ-20 risks/decisions/open items; recent or low-traffic feature path; keep until pilot workload has representative stats. | `decisions_supersedes_idx ON decisions USING btree (supersedes_decision_id) WHERE (supersedes_decision_id IS NOT NULL)` |
| alpha | `dependencies` | `dependencies_created_by_idx` | Drop candidate | feature-spec anchor pending; no active route/RPC dependency found; redundant/audit-only single-column index. | `dependencies_created_by_idx ON dependencies USING btree (created_by)` |
| beta | `dependencies` | `dependencies_from_idx` | Keep - feature-pending | feature-spec anchor pending; recent or low-traffic feature path; keep until pilot workload has representative stats. | `dependencies_from_idx ON dependencies USING btree (tenant_id, from_type, from_id)` |
| alpha | `ki_provenance` | `ki_provenance_entity_idx` | Drop candidate | PROJ-12 AI provenance; no active route/RPC dependency found; redundant/audit-only single-column index. | `ki_provenance_entity_idx ON ki_provenance USING btree (entity_type, entity_id)` |
| alpha | `ki_provenance` | `ki_provenance_suggestion_idx` | Drop candidate | PROJ-12 AI provenance; no active route/RPC dependency found; redundant/audit-only single-column index. | `ki_provenance_suggestion_idx ON ki_provenance USING btree (ki_suggestion_id)` |
| beta | `ki_runs` | `ki_runs_actor_idx` | Keep - feature-pending | PROJ-12 AI provenance; recent or low-traffic feature path; keep until pilot workload has representative stats. | `ki_runs_actor_idx ON ki_runs USING btree (actor_user_id, created_at DESC) WHERE (actor_user_id IS NOT NULL)` |
| beta | `ki_runs` | `ki_runs_project_idx` | Keep - feature-pending | PROJ-12 AI provenance; recent or low-traffic feature path; keep until pilot workload has representative stats. | `ki_runs_project_idx ON ki_runs USING btree (project_id, created_at DESC)` |
| gamma | `ki_runs` | `ki_runs_tenant_billing_idx` | Keep - admin/cron only | PROJ-12 AI provenance; operational, billing, retention, or audit path can miss daily idx_scan windows. | `ki_runs_tenant_billing_idx ON ki_runs USING btree (tenant_id, created_at DESC) WHERE (status = ANY (ARRAY['success'::text, 'error'::text]))` |
| beta | `ki_suggestions` | `ki_suggestions_run_idx` | Keep - feature-pending | PROJ-12 AI provenance; recent or low-traffic feature path; keep until pilot workload has representative stats. | `ki_suggestions_run_idx ON ki_suggestions USING btree (ki_run_id)` |
| beta | `locations` | `locations_import_id_idx` | Keep - feature-pending | PROJ-62/63 organization; recent or low-traffic feature path; keep until pilot workload has representative stats. | `locations_import_id_idx ON locations USING btree (import_id) WHERE (import_id IS NOT NULL)` |
| beta | `locations` | `locations_tenant_active_name_idx` | Keep - feature-pending | PROJ-62/63 organization; recent or low-traffic feature path; keep until pilot workload has representative stats. | `locations_tenant_active_name_idx ON locations USING btree (tenant_id, name) WHERE (is_active = true)` |
| beta | `milestones` | `milestones_project_target_idx` | Keep - feature-pending | PROJ-19 phases/milestones; recent or low-traffic feature path; keep until pilot workload has representative stats. | `milestones_project_target_idx ON milestones USING btree (project_id, target_date)` |
| beta | `open_items` | `open_items_project_status_idx` | Keep - feature-pending | PROJ-20 risks/decisions/open items; recent or low-traffic feature path; keep until pilot workload has representative stats. | `open_items_project_status_idx ON open_items USING btree (project_id, status)` |
| beta | `organization_units` | `organization_units_import_id_idx` | Keep - feature-pending | PROJ-62/63 organization; recent or low-traffic feature path; keep until pilot workload has representative stats. | `organization_units_import_id_idx ON organization_units USING btree (import_id) WHERE (import_id IS NOT NULL)` |
| beta | `organization_units` | `organization_units_tenant_idx` | Keep - feature-pending | PROJ-62/63 organization; recent or low-traffic feature path; keep until pilot workload has representative stats. | `organization_units_tenant_idx ON organization_units USING btree (tenant_id)` |
| beta | `phases` | `phases_project_id_idx` | Keep - feature-pending | PROJ-19 phases/milestones; recent or low-traffic feature path; keep until pilot workload has representative stats. | `phases_project_id_idx ON phases USING btree (project_id)` |
| beta | `project_goals` | `project_goals_parent_idx` | Keep - feature-pending | PROJ-65 trajectory goals; recent or low-traffic feature path; keep until pilot workload has representative stats. | `project_goals_parent_idx ON project_goals USING btree (parent_goal_id) WHERE (parent_goal_id IS NOT NULL)` |
| beta | `project_goals` | `project_goals_source_milestone_idx` | Keep - feature-pending | PROJ-65 trajectory goals; recent or low-traffic feature path; keep until pilot workload has representative stats. | `project_goals_source_milestone_idx ON project_goals USING btree (source_milestone_id) WHERE (source_milestone_id IS NOT NULL)` |
| beta | `project_goals` | `project_goals_source_phase_idx` | Keep - feature-pending | PROJ-65 trajectory goals; recent or low-traffic feature path; keep until pilot workload has representative stats. | `project_goals_source_phase_idx ON project_goals USING btree (source_phase_id) WHERE (source_phase_id IS NOT NULL)` |
| beta | `project_goals` | `project_goals_tenant_project_idx` | Keep - feature-pending | PROJ-65 trajectory goals; recent or low-traffic feature path; keep until pilot workload has representative stats. | `project_goals_tenant_project_idx ON project_goals USING btree (tenant_id, project_id)` |
| beta | `project_wizard_drafts` | `pwd_tenant_user_idx` | Keep - feature-pending | PROJ-5 wizard drafts; recent or low-traffic feature path; keep until pilot workload has representative stats. | `pwd_tenant_user_idx ON project_wizard_drafts USING btree (tenant_id, created_by)` |
| beta | `projects` | `projects_parent_project_id_idx` | Keep - feature-pending | PROJ-2 project lifecycle; recent or low-traffic feature path; keep until pilot workload has representative stats. | `projects_parent_project_id_idx ON projects USING btree (parent_project_id) WHERE (parent_project_id IS NOT NULL)` |
| beta | `projects` | `projects_responsible_user_id_idx` | Keep - feature-pending | PROJ-2 project lifecycle; recent or low-traffic feature path; keep until pilot workload has representative stats. | `projects_responsible_user_id_idx ON projects USING btree (responsible_user_id)` |
| alpha | `projects` | `projects_tenant_id_idx` | Drop candidate | PROJ-2 project lifecycle; no active route/RPC dependency found; redundant/audit-only single-column index. | `projects_tenant_id_idx ON projects USING btree (tenant_id)` |
| beta | `projects` | `projects_tenant_id_lifecycle_status_idx` | Keep - feature-pending | PROJ-2 project lifecycle; recent or low-traffic feature path; keep until pilot workload has representative stats. | `projects_tenant_id_lifecycle_status_idx ON projects USING btree (tenant_id, lifecycle_status)` |
| beta | `releases` | `releases_target_milestone_idx` | Keep - feature-pending | PROJ-61 releases; recent or low-traffic feature path; keep until pilot workload has representative stats. | `releases_target_milestone_idx ON releases USING btree (target_milestone_id) WHERE (target_milestone_id IS NOT NULL)` |
| beta | `releases` | `releases_tenant_project_idx` | Keep - feature-pending | PROJ-61 releases; recent or low-traffic feature path; keep until pilot workload has representative stats. | `releases_tenant_project_idx ON releases USING btree (tenant_id, project_id)` |
| gamma | `report_snapshots` | `idx_report_snapshots_generated_by` | Keep - admin/cron only | PROJ-21 reports; operational, billing, retention, or audit path can miss daily idx_scan windows. | `idx_report_snapshots_generated_by ON report_snapshots USING btree (generated_by)` |
| beta | `resources` | `resources_organization_unit_idx` | Keep - feature-pending | PROJ-11/57 resources; recent or low-traffic feature path; keep until pilot workload has representative stats. | `resources_organization_unit_idx ON resources USING btree (organization_unit_id) WHERE (organization_unit_id IS NOT NULL)` |
| gamma | `retention_export_log` | `rel_tenant_idx` | Keep - admin/cron only | PROJ-10 audit retention; operational, billing, retention, or audit path can miss daily idx_scan windows. | `rel_tenant_idx ON retention_export_log USING btree (tenant_id, exported_at DESC)` |
| beta | `risk_links` | `idx_risk_links_risk_id` | Keep - feature-pending | PROJ-65 trajectory/cross-links; recent or low-traffic feature path; keep until pilot workload has representative stats. | `idx_risk_links_risk_id ON risk_links USING btree (risk_id)` |
| beta | `risks` | `risks_responsible_idx` | Keep - feature-pending | PROJ-20 risks/decisions/open items; recent or low-traffic feature path; keep until pilot workload has representative stats. | `risks_responsible_idx ON risks USING btree (responsible_user_id) WHERE (responsible_user_id IS NOT NULL)` |
| alpha | `sprints` | `sprints_created_by_idx` | Drop candidate | PROJ-9 sprints; no active route/RPC dependency found; redundant/audit-only single-column index. | `sprints_created_by_idx ON sprints USING btree (created_by)` |
| beta | `sprints` | `sprints_project_state_idx` | Keep - feature-pending | PROJ-9 sprints; recent or low-traffic feature path; keep until pilot workload has representative stats. | `sprints_project_state_idx ON sprints USING btree (project_id, state)` |
| beta | `stakeholder_coaching_recommendations` | `scr_stakeholder_state_idx` | Keep - feature-pending | PROJ-34 stakeholder coaching; recent or low-traffic feature path; keep until pilot workload has representative stats. | `scr_stakeholder_state_idx ON stakeholder_coaching_recommendations USING btree (stakeholder_id, review_state) WHERE (deleted_at IS NULL)` |
| beta | `stakeholder_coaching_recommendations` | `scr_tenant_project_idx` | Keep - feature-pending | PROJ-34 stakeholder coaching; recent or low-traffic feature path; keep until pilot workload has representative stats. | `scr_tenant_project_idx ON stakeholder_coaching_recommendations USING btree (tenant_id, project_id)` |
| beta | `stakeholder_interaction_participants` | `sip_tenant_stakeholder_idx` | Keep - feature-pending | PROJ-34 stakeholder intelligence; recent or low-traffic feature path; keep until pilot workload has representative stats. | `sip_tenant_stakeholder_idx ON stakeholder_interaction_participants USING btree (tenant_id, stakeholder_id)` |
| beta | `stakeholder_interactions` | `stakeholder_interactions_replies_idx` | Keep - feature-pending | PROJ-34 stakeholder intelligence; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholder_interactions_replies_idx ON stakeholder_interactions USING btree (replies_to_interaction_id) WHERE (replies_to_interaction_id IS NOT NULL)` |
| beta | `stakeholder_interactions` | `stakeholder_interactions_tenant_project_idx` | Keep - feature-pending | PROJ-34 stakeholder intelligence; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholder_interactions_tenant_project_idx ON stakeholder_interactions USING btree (tenant_id, project_id)` |
| beta | `stakeholder_personality_profiles` | `stakeholder_personality_profiles_tenant_idx` | Keep - feature-pending | PROJ-34 stakeholder intelligence; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholder_personality_profiles_tenant_idx ON stakeholder_personality_profiles USING btree (tenant_id)` |
| beta | `stakeholder_self_assessment_invites` | `stakeholder_self_assessment_invites_tenant_idx` | Keep - feature-pending | PROJ-34 stakeholder intelligence; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholder_self_assessment_invites_tenant_idx ON stakeholder_self_assessment_invites USING btree (tenant_id)` |
| beta | `stakeholder_skill_profiles` | `stakeholder_skill_profiles_tenant_idx` | Keep - feature-pending | PROJ-34 stakeholder intelligence; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholder_skill_profiles_tenant_idx ON stakeholder_skill_profiles USING btree (tenant_id)` |
| beta | `stakeholders` | `stakeholders_attitude_idx` | Keep - feature-pending | PROJ-8 stakeholders; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholders_attitude_idx ON stakeholders USING btree (project_id, attitude) WHERE (attitude = ANY (ARRAY['critical'::text, 'blocking'::text]))` |
| beta | `stakeholders` | `stakeholders_is_approver_idx` | Keep - feature-pending | PROJ-8 stakeholders; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholders_is_approver_idx ON stakeholders USING btree (project_id) WHERE (is_approver = true)` |
| beta | `stakeholders` | `stakeholders_linked_user_idx` | Keep - feature-pending | PROJ-8 stakeholders; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholders_linked_user_idx ON stakeholders USING btree (linked_user_id) WHERE (linked_user_id IS NOT NULL)` |
| beta | `stakeholders` | `stakeholders_organization_unit_idx` | Keep - feature-pending | PROJ-8 stakeholders; recent or low-traffic feature path; keep until pilot workload has representative stats. | `stakeholders_organization_unit_idx ON stakeholders USING btree (organization_unit_id) WHERE (organization_unit_id IS NOT NULL)` |
| beta | `tenant_memberships` | `tenant_memberships_organization_unit_idx` | Keep - feature-pending | PROJ-1 tenants/auth; recent or low-traffic feature path; keep until pilot workload has representative stats. | `tenant_memberships_organization_unit_idx ON tenant_memberships USING btree (organization_unit_id) WHERE (organization_unit_id IS NOT NULL)` |
| alpha | `tenants` | `tenants_created_by_idx` | Drop candidate | PROJ-1 tenants/auth; no active route/RPC dependency found; redundant/audit-only single-column index. | `tenants_created_by_idx ON tenants USING btree (created_by)` |
| beta | `vendor_invoices` | `vendor_invoices_project_idx` | Keep - feature-pending | PROJ-15 vendor procurement; recent or low-traffic feature path; keep until pilot workload has representative stats. | `vendor_invoices_project_idx ON vendor_invoices USING btree (project_id) WHERE (project_id IS NOT NULL)` |
| beta | `vendor_invoices` | `vendor_invoices_tenant_idx` | Keep - feature-pending | PROJ-15 vendor procurement; recent or low-traffic feature path; keep until pilot workload has representative stats. | `vendor_invoices_tenant_idx ON vendor_invoices USING btree (tenant_id)` |
| beta | `vendor_invoices` | `vendor_invoices_vendor_idx` | Keep - feature-pending | PROJ-15 vendor procurement; recent or low-traffic feature path; keep until pilot workload has representative stats. | `vendor_invoices_vendor_idx ON vendor_invoices USING btree (vendor_id, invoice_date DESC)` |
| beta | `work_item_cost_lines` | `work_item_cost_lines_source_ref_idx` | Keep - feature-pending | PROJ-9 work item metamodel; recent or low-traffic feature path; keep until pilot workload has representative stats. | `work_item_cost_lines_source_ref_idx ON work_item_cost_lines USING btree (source_ref_id) WHERE (source_ref_id IS NOT NULL)` |
| beta | `work_item_links` | `work_item_links_approval_project_idx` | Keep - feature-pending | PROJ-65 trajectory/cross-links; recent or low-traffic feature path; keep until pilot workload has representative stats. | `work_item_links_approval_project_idx ON work_item_links USING btree (approval_project_id, approval_state) WHERE (approval_project_id IS NOT NULL)` |
| beta | `work_item_links` | `work_item_links_from_project_idx` | Keep - feature-pending | PROJ-65 trajectory/cross-links; recent or low-traffic feature path; keep until pilot workload has representative stats. | `work_item_links_from_project_idx ON work_item_links USING btree (from_project_id, approval_state)` |
| beta | `work_item_links` | `work_item_links_tenant_idx` | Keep - feature-pending | PROJ-65 trajectory/cross-links; recent or low-traffic feature path; keep until pilot workload has representative stats. | `work_item_links_tenant_idx ON work_item_links USING btree (tenant_id)` |
| beta | `work_item_links` | `work_item_links_to_project_idx` | Keep - feature-pending | PROJ-65 trajectory/cross-links; recent or low-traffic feature path; keep until pilot workload has representative stats. | `work_item_links_to_project_idx ON work_item_links USING btree (to_project_id, approval_state)` |
| beta | `work_item_tags` | `wit_tag_idx` | Keep - feature-pending | PROJ-9 work item metamodel; recent or low-traffic feature path; keep until pilot workload has representative stats. | `wit_tag_idx ON work_item_tags USING btree (tag_id)` |
| alpha | `work_items` | `work_items_created_by_idx` | Drop candidate | PROJ-9 work item metamodel; no active route/RPC dependency found; redundant/audit-only single-column index. | `work_items_created_by_idx ON work_items USING btree (created_by)` |
| beta | `work_items` | `work_items_milestone_id_idx` | Keep - feature-pending | PROJ-9 work item metamodel; recent or low-traffic feature path; keep until pilot workload has representative stats. | `work_items_milestone_id_idx ON work_items USING btree (milestone_id) WHERE ((is_deleted = false) AND (milestone_id IS NOT NULL))` |

## Zero-Scan Unique Constraints Not In Drop Set

These rows have `idx_scan = 0`, but Phase 1 keeps them out of the drop-candidate set because they enforce uniqueness or conflict/idempotency semantics. If a duplicate non-unique index exists, only that duplicate is marked `alpha` above.

| Table | Index | Definition |
|---|---|---|
| `budget_postings` | `budget_postings_reverses_unique` | `budget_postings_reverses_unique ON budget_postings USING btree (reverses_posting_id) WHERE (reverses_posting_id IS NOT NULL)` |
| `compliance_trigger_log` | `ctl_unique_per_phase` | `ctl_unique_per_phase ON compliance_trigger_log USING btree (work_item_id, tag_id, phase)` |
| `decision_approvers` | `decision_approvers_decision_id_stakeholder_id_key` | `decision_approvers_decision_id_stakeholder_id_key ON decision_approvers USING btree (decision_id, stakeholder_id)` |
| `decision_approvers` | `decision_approvers_magic_link_token_key` | `decision_approvers_magic_link_token_key ON decision_approvers USING btree (magic_link_token)` |
| `fx_rates` | `fx_rates_pair_unique` | `fx_rates_pair_unique ON fx_rates USING btree (tenant_id, from_currency, to_currency, valid_on, source)` |
| `ki_provenance` | `ki_provenance_entity_unique` | `ki_provenance_entity_unique ON ki_provenance USING btree (entity_type, entity_id)` |
| `ki_provenance` | `ki_provenance_suggestion_unique` | `ki_provenance_suggestion_unique ON ki_provenance USING btree (ki_suggestion_id)` |
| `locations` | `locations_tenant_code_unique` | `locations_tenant_code_unique ON locations USING btree (tenant_id, code) WHERE (code IS NOT NULL)` |
| `organization_units` | `organization_units_tenant_code_unique` | `organization_units_tenant_code_unique ON organization_units USING btree (tenant_id, code) WHERE (code IS NOT NULL)` |
| `report_snapshots` | `report_snapshots_unique_version` | `report_snapshots_unique_version ON report_snapshots USING btree (project_id, kind, version)` |
| `risk_links` | `risk_links_unique_edge` | `risk_links_unique_edge ON risk_links USING btree (risk_id, linked_kind, linked_id)` |
| `role_rates` | `role_rates_unique_per_role_and_date` | `role_rates_unique_per_role_and_date ON role_rates USING btree (tenant_id, role_key, valid_from)` |
| `tenant_ai_cost_caps` | `tenant_ai_cost_caps_tenant_purpose_unique` | `tenant_ai_cost_caps_tenant_purpose_unique ON tenant_ai_cost_caps USING btree (tenant_id, purpose) NULLS NOT DISTINCT` |
| `tenants` | `tenants_domain_unique` | `tenants_domain_unique ON tenants USING btree (domain) WHERE (domain IS NOT NULL)` |
| `vendor_project_assignments` | `vpa_unique_per_role` | `vpa_unique_per_role ON vendor_project_assignments USING btree (project_id, vendor_id, role)` |
| `work_item_links` | `work_item_links_unique_project_edge` | `work_item_links_unique_project_edge ON work_item_links USING btree (from_work_item_id, to_project_id, link_type) WHERE (to_work_item_id IS NULL)` |
| `work_item_tags` | `wit_work_item_tag_unique` | `wit_work_item_tag_unique ON work_item_tags USING btree (work_item_id, tag_id)` |
| `work_items` | `work_items_wbs_code_unique_per_sibling` | `work_items_wbs_code_unique_per_sibling ON work_items USING btree (project_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), wbs_code) WHERE (wbs_code IS NOT NULL)` |

## Phase 2/3 Guardrails

- Refresh Supabase performance advisor immediately before writing migrations; use this doc as the triage baseline, not as a stale execution list.
- Alpha add-index migration should add only class `a` FK indexes and use `CONCURRENTLY` if row estimates justify it.
- Beta drop migration should drop only class `alpha` indexes, one statement per index, after confirming no route/RPC/test has gained a dependency.
- Gamma/comment migration should document every `b`, `beta`, and `gamma` keep decision so future advisor runs are auditable.
- Do not drop unique indexes solely because `idx_scan = 0`.
