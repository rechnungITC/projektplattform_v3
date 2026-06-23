-- =============================================================================
-- PROJ-136 — ERP-Pilot Golden-Path End-to-End Live-Seed Smoke
-- =============================================================================
-- Exercises the full ERP backlog chain as a CHAIN (not isolated slices) against
-- the real DB: seed -> KI-suggestions -> the three PROJ-70/88/89 accept RPCs ->
-- verified persistence (work_items hierarchy, stakeholders, risks, ki_provenance)
-- -> phases/budget/report -> teardown with 0-residue check.
--
-- Run section-by-section as a privileged role (postgres/service_role). Mutating
-- accept RPCs run under the seeded admin identity (SET ROLE authenticated +
-- request.jwt.claims). Re-run after any change to the accept RPCs, the work-item
-- kind taxonomy, the method-templates, or the report/budget schema.
--
-- HISTORY: on its very first run (2026-06-22) this smoke caught a HIGH latent
-- bug — the waterfall AI-backlog accept was broken across 3 layers (prompts +
-- RPC allowed phase/work_package/todo, but work_items.kind_check only allows
-- work_package of those; method-template says work_package/task/bug). Fixed in
-- migration 20260622100000_proj70_fix_waterfall_kind_taxonomy + the AI schema/
-- prompts. This smoke now uses the corrected waterfall kinds (work_package/
-- task/bug) and passes end-to-end. Proven 0 work_items with kind phase/todo
-- exist in all of prod -> the waterfall accept path had never succeeded before.
--
-- IDENTITIES: admin 13600000-…-a1 (tenant admin of GP136 tenant …-a0),
--             ERP waterfall project …-b0.
-- =============================================================================

-- --- Section 1: SEED (postgres/service_role) ---------------------------------
insert into auth.users (id) values ('13600000-0000-4000-8000-0000000000a1') on conflict do nothing;
insert into public.profiles (id, email, display_name) values
  ('13600000-0000-4000-8000-0000000000a1','gp136-admin@pilot.local','GP136 Admin') on conflict do nothing;
insert into public.tenants (id, name) values ('13600000-0000-4000-8000-0000000000a0','GP136-PILOT') on conflict do nothing;
insert into public.tenant_memberships (tenant_id, user_id, role) values
  ('13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000a1','admin') on conflict do nothing;
-- ERP project, waterfall method (Draft->Active transition covered by PROJ-2 suite)
insert into public.projects (id, tenant_id, name, responsible_user_id, created_by, project_type, project_method, lifecycle_status) values
  ('13600000-0000-4000-8000-0000000000b0','13600000-0000-4000-8000-0000000000a0','GP136 ERP Rollout','13600000-0000-4000-8000-0000000000a1','13600000-0000-4000-8000-0000000000a1','erp','waterfall','active') on conflict do nothing;
-- fixed kickoff fixture (AC-5)
insert into public.context_sources (id, tenant_id, project_id, kind, title, content_excerpt, language, privacy_class, processing_status, created_by) values
  ('13600000-0000-4000-8000-0000000000c0','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','email','GP136 Kickoff ERP','ERP-Einführung Finanzbuchhaltung; Sponsor Hr. Mustermann; Risiko Datenmigration.','de',2,'classified','13600000-0000-4000-8000-0000000000a1') on conflict do nothing;
-- one ki_run per purpose (project_id required by ki_runs_project_id_bounded_null)
insert into public.ki_runs (id, tenant_id, project_id, purpose, classification, provider, status) values
  ('13600000-0000-4000-8000-0000000000e1','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','proposal_from_context',2,'stub','success'),
  ('13600000-0000-4000-8000-0000000000e2','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','proposal_stakeholders_from_context',2,'stub','success'),
  ('13600000-0000-4000-8000-0000000000e3','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','proposal_risks_from_context',2,'stub','success') on conflict do nothing;
-- ki_suggestions (draft). NB original_payload is NOT NULL -> = payload.
-- WATERFALL kinds = work_package > task > bug (post-fix taxonomy).
insert into public.ki_suggestions (id, tenant_id, project_id, ki_run_id, purpose, payload, original_payload, status, created_by)
select id,tenant_id,project_id,ki_run_id,purpose,payload,payload,status,created_by from (values
  ('13600000-0000-4000-8000-0000000000d1'::uuid,'13600000-0000-4000-8000-0000000000a0'::uuid,'13600000-0000-4000-8000-0000000000b0'::uuid,'13600000-0000-4000-8000-0000000000e1'::uuid,'proposal_from_context','{"temp_id":"wp1","kind":"work_package","title":"AP 1 Ist-Analyse"}'::jsonb,'draft','13600000-0000-4000-8000-0000000000a1'::uuid),
  ('13600000-0000-4000-8000-0000000000d2','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','13600000-0000-4000-8000-0000000000e1','proposal_from_context','{"temp_id":"t1","parent_temp_id":"wp1","kind":"task","title":"Fachbereich-Interviews"}','draft','13600000-0000-4000-8000-0000000000a1'),
  ('13600000-0000-4000-8000-0000000000d3','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','13600000-0000-4000-8000-0000000000e1','proposal_from_context','{"temp_id":"b1","parent_temp_id":"t1","kind":"bug","title":"Altdaten-Inkonsistenz"}','draft','13600000-0000-4000-8000-0000000000a1'),
  ('13600000-0000-4000-8000-0000000000d4','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','13600000-0000-4000-8000-0000000000e2','proposal_stakeholders_from_context','{"name":"Max Mustermann","kind":"person","origin":"external","role_key":"sponsor"}','draft','13600000-0000-4000-8000-0000000000a1'),
  ('13600000-0000-4000-8000-0000000000d5','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','13600000-0000-4000-8000-0000000000e3','proposal_risks_from_context','{"title":"Datenmigration verzögert","description":"Legacy-Daten unsauber","probability":3,"impact":4,"mitigation":"Frühes Daten-Cleansing"}','draft','13600000-0000-4000-8000-0000000000a1')
) as v(id,tenant_id,project_id,ki_run_id,purpose,payload,status,created_by) on conflict do nothing;

-- --- Section 2: ACCEPT CHAIN (as the seeded admin) ---------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"13600000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select public.accept_proposal_from_context_bulk('13600000-0000-4000-8000-0000000000b0',
  array['13600000-0000-4000-8000-0000000000d1','13600000-0000-4000-8000-0000000000d2','13600000-0000-4000-8000-0000000000d3']::uuid[], true);
select public.accept_stakeholder_proposals_bulk('13600000-0000-4000-8000-0000000000b0',
  array['13600000-0000-4000-8000-0000000000d4']::uuid[]);
select public.accept_risk_proposals_bulk('13600000-0000-4000-8000-0000000000b0',
  array['13600000-0000-4000-8000-0000000000d5']::uuid[]);
reset role;

-- --- Section 3: VERIFY persistence -------------------------------------------
-- EXPECT: 3 work_items (work_package>task>bug hierarchy), 1 stakeholder, 1 risk
-- (status='open'), ki_provenance entity_type in {work_items, stakeholders, risks}
-- (all match the ki_provenance entity_type CHECK), 5 suggestions accepted.
select jsonb_build_object(
  'work_items', (select jsonb_agg(kind order by kind) from work_items where project_id='13600000-0000-4000-8000-0000000000b0'),
  'wp_task_edge', (select count(*) from work_items c join work_items p on c.parent_id=p.id where c.project_id='13600000-0000-4000-8000-0000000000b0' and p.kind='work_package' and c.kind='task'),
  'task_bug_edge', (select count(*) from work_items c join work_items p on c.parent_id=p.id where c.project_id='13600000-0000-4000-8000-0000000000b0' and p.kind='task' and c.kind='bug'),
  'stakeholders', (select count(*) from stakeholders where project_id='13600000-0000-4000-8000-0000000000b0'),
  'risks_open', (select count(*) from risks where project_id='13600000-0000-4000-8000-0000000000b0' and status='open'),
  'provenance_types', (select jsonb_agg(distinct entity_type order by entity_type) from ki_provenance pv join ki_suggestions s on s.id=pv.ki_suggestion_id where s.project_id='13600000-0000-4000-8000-0000000000b0'),
  'suggestions_accepted', (select count(*) from ki_suggestions where project_id='13600000-0000-4000-8000-0000000000b0' and status='accepted')
) as backlog_verify;

-- --- Section 4: PHASES + BUDGET (PROJ-19 / PROJ-22) + roll-up ----------------
insert into public.phases (id, tenant_id, project_id, name, sequence_number, status, created_by) values
  ('13600000-0000-4000-8000-0000000000f1','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','Analyse',1,'planned','13600000-0000-4000-8000-0000000000a1') on conflict do nothing;
insert into public.budget_categories (id, tenant_id, project_id, name, created_by) values
  ('13600000-0000-4000-8000-0000000000a5','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','Personal','13600000-0000-4000-8000-0000000000a1') on conflict do nothing;
insert into public.budget_items (id, tenant_id, project_id, category_id, name, planned_amount, planned_currency, created_by) values
  ('13600000-0000-4000-8000-0000000000a6','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','13600000-0000-4000-8000-0000000000a5','Beratung',10000.00,'EUR','13600000-0000-4000-8000-0000000000a1') on conflict do nothing;

-- --- Section 5: REPORT SNAPSHOT (PROJ-21) ------------------------------------
insert into public.report_snapshots (id, tenant_id, project_id, kind, version, generated_by, content) values
  ('13600000-0000-4000-8000-0000000000b5','13600000-0000-4000-8000-0000000000a0','13600000-0000-4000-8000-0000000000b0','status_report',1,'13600000-0000-4000-8000-0000000000a1','{"smoke":"PROJ-136 golden-path"}') on conflict do nothing;
select jsonb_build_object(
  'phases', (select count(*) from phases where project_id='13600000-0000-4000-8000-0000000000b0'),
  'budget_items', (select count(*) from budget_items where project_id='13600000-0000-4000-8000-0000000000b0'),
  'report_snapshots', (select count(*) from report_snapshots where project_id='13600000-0000-4000-8000-0000000000b0')
) as downstream_verify;

-- --- Section 6: JIRA EXPORT PREVIEW (PROJ-47) --------------------------------
-- The preview is an HTTP route (POST /api/projects/[id]/jira/export/preview),
-- out of scope for a pure-SQL smoke (covered by PROJ-47's own tests). The SQL
-- precondition: the accepted work_items are exportable (exist + tenant-scoped).
-- A future layered Playwright pass can add the live preview call.

-- --- Section 7: TEARDOWN (0-residue; one transaction, valid final SELECT) -----
reset role;
set session_replication_role = replica;  -- suppress invariant triggers during cleanup
delete from public.report_snapshots where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.budget_items where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.budget_categories where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.phases where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.ki_provenance where ki_suggestion_id in (select id from ki_suggestions where project_id='13600000-0000-4000-8000-0000000000b0');
delete from public.ki_suggestions where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.ki_runs where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.resources where source_stakeholder_id in (select id from stakeholders where project_id='13600000-0000-4000-8000-0000000000b0');
delete from public.stakeholders where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.risks where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.work_items where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.context_sources where project_id='13600000-0000-4000-8000-0000000000b0';
delete from public.projects where id='13600000-0000-4000-8000-0000000000b0';
delete from public.tenant_memberships where tenant_id='13600000-0000-4000-8000-0000000000a0';
delete from public.tenants where id='13600000-0000-4000-8000-0000000000a0';
delete from public.profiles where id='13600000-0000-4000-8000-0000000000a1';
delete from auth.users where id='13600000-0000-4000-8000-0000000000a1';
set session_replication_role = origin;
select 'residue' as check,
  (select count(*) from tenants where name='GP136-PILOT') as tenants,
  (select count(*) from projects where id='13600000-0000-4000-8000-0000000000b0') as projects;  -- EXPECT 0,0

-- =============================================================================
-- Section 8: AC-6 — NEGATIVE ASSERTION (a broken/invalid link must fail LOUD)
-- =============================================================================
-- Guards the PROJ-70 waterfall-kind-taxonomy fix: a waterfall backlog item with
-- kind='phase' (no longer valid post-fix) MUST be rejected by the accept RPC,
-- not silently accepted. This is the automated negative proof for AC-6 — and a
-- regression guard so the fixed taxonomy cannot silently drift back.
--
-- QA-verified live vs prod 2026-06-22: the accept below raises
--   ERROR 23514 method_kind_incompatible
--   DETAIL: Project method waterfall requires kind in (work_package, task, bug).
-- A green run = this section ERRORS exactly here (the error IS the pass). If the
-- accept ever SUCCEEDS, the taxonomy gate has regressed -> investigate PROJ-70.

-- seed a waterfall project + one kind='phase' suggestion
insert into auth.users (id) values ('13600000-0000-4000-8000-0000000000c1') on conflict do nothing;
insert into public.profiles (id, email, display_name) values ('13600000-0000-4000-8000-0000000000c1','gp136qa@pilot.local','GP136QA Admin') on conflict do nothing;
insert into public.tenants (id, name) values ('13600000-0000-4000-8000-0000000000c0','GP136-QA') on conflict do nothing;
insert into public.tenant_memberships (tenant_id, user_id, role) values ('13600000-0000-4000-8000-0000000000c0','13600000-0000-4000-8000-0000000000c1','admin') on conflict do nothing;
insert into public.projects (id, tenant_id, name, responsible_user_id, created_by, project_type, project_method, lifecycle_status) values
  ('13600000-0000-4000-8000-0000000000c2','13600000-0000-4000-8000-0000000000c0','GP136QA WF','13600000-0000-4000-8000-0000000000c1','13600000-0000-4000-8000-0000000000c1','erp','waterfall','active') on conflict do nothing;
insert into public.ki_runs (id, tenant_id, project_id, purpose, classification, provider, status) values
  ('13600000-0000-4000-8000-0000000000c3','13600000-0000-4000-8000-0000000000c0','13600000-0000-4000-8000-0000000000c2','proposal_from_context',2,'stub','success') on conflict do nothing;
insert into public.ki_suggestions (id, tenant_id, project_id, ki_run_id, purpose, payload, original_payload, status, created_by) values
  ('13600000-0000-4000-8000-0000000000ca','13600000-0000-4000-8000-0000000000c0','13600000-0000-4000-8000-0000000000c2','13600000-0000-4000-8000-0000000000c3','proposal_from_context','{"temp_id":"px","kind":"phase","title":"NEG phase"}','{"temp_id":"px","kind":"phase","title":"NEG phase"}','draft','13600000-0000-4000-8000-0000000000c1') on conflict do nothing;

set role authenticated;
set request.jwt.claims = '{"sub":"13600000-0000-4000-8000-0000000000c1","role":"authenticated"}';
-- >>> THIS MUST RAISE 23514 method_kind_incompatible <<<
select public.accept_proposal_from_context_bulk('13600000-0000-4000-8000-0000000000c2',
  array['13600000-0000-4000-8000-0000000000ca']::uuid[], true);
reset role;

-- Teardown of the negative-assertion fixture (run after observing the expected error):
set session_replication_role = replica;
delete from public.ki_suggestions where project_id='13600000-0000-4000-8000-0000000000c2';
delete from public.ki_runs where project_id='13600000-0000-4000-8000-0000000000c2';
delete from public.projects where id='13600000-0000-4000-8000-0000000000c2';
delete from public.tenant_memberships where tenant_id='13600000-0000-4000-8000-0000000000c0';
delete from public.tenants where id='13600000-0000-4000-8000-0000000000c0';
delete from public.profiles where id='13600000-0000-4000-8000-0000000000c1';
delete from auth.users where id='13600000-0000-4000-8000-0000000000c1';
set session_replication_role = origin;
