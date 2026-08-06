-- PROJ-Y-96b + PROJ-Y-96e — apply_ma_project_template consolidation.
--
-- PROJ-Y-96b (2026-08-06) shipped a hotfix that recreated
-- `apply_ma_project_template` with the RACI copy block but overwrote the task
-- copy that PROJ-Y-96e (2026-08-05) had installed earlier in Prod. This
-- consolidation combines BOTH branches into a single RPC + a unified
-- `warnings jsonb` return shape so consumers no longer see one slice or the
-- other lose its extension.
--
-- Warning shape change (breaking for Y-96e's initial text[] format):
-- `warnings` is now `jsonb` — an array of `{code, ...specific-fields}` objects.
-- Y-96e's colon-delimited codes are decomposed into structured fields:
--   • `skipped_task_missing_workstream`     — {code, task_key, workstream_key}
--   • `skipped_task_missing_phase`          — {code, task_key, phase_key}
--   • `skipped_subtask_missing_workstream`  — {code, task_key, workstream_key}
--   • `skipped_subtask_missing_phase`       — {code, task_key, phase_key}
--   • `skipped_subtask_parent_missing`      — {code, task_key, parent_task_key}
-- Y-96b RACI warnings retain their jsonb form:
--   • `raci_unknown_role_key`               — {code, target_type, target_key, role_key}
--   • `raci_orphan_target`                  — {code, target_type, target_key, role_key}
--
-- Consumers: `src/app/api/wizard-drafts/[id]/finalize/route.ts` was rewritten
-- to parse jsonb objects (aggregation for Y-96b RACI + individual entries for
-- Y-96e task-skip). Y-96e's initial deploy did not trigger warnings in Prod
-- (Buy-Side seed produces no skipped rows against the standard 10-phase
-- model), so no callers are on the old text[] format.
--
-- Also ensures `ensure_default_ma_project_templates` writes both:
--   • Y-96b RACI seed rows (Fork B1) — idempotent-if-missing
--   • Y-96e task seed rows (L5)      — idempotent-if-missing
-- for existing templates AND fresh templates. Both slices now backfill their
-- kind-tables for previously-seeded tenants; this is a documented deviation
-- from Y-96b's original AC-Y96b.7 (`nicht rückwirkend`), justified by
-- symmetry with Y-96e's L5 pattern and better UX for Prod-existing tenants.
--
-- Idempotent: uses `create or replace function` (preserves grants), respects
-- `on conflict do nothing` for the template head insert, and gates seeds
-- with `count = 0` checks.

--------------------------------------------------------------------------------
-- 1. ensure_default_ma_project_templates — combines Y-96e task-backfill with
--    Y-96b RACI-backfill, both idempotent.
--------------------------------------------------------------------------------
create or replace function public.ensure_default_ma_project_templates(p_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_template_id  uuid;
  v_seeded       int := 0;
  v_task_count   int := 0;
  v_raci_count   int := 0;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'not a tenant member' using errcode = '42501';
  end if;

  insert into public.ma_project_templates (tenant_id, template_key, name, deal_side, description, version)
  values (p_tenant_id, 'buy_side_standard', 'Buy-Side M&A (Standard)', 'buy',
          'Standard-Struktur für Buy-Side-M&A-Projekte: Standard-Workstreams, -Deliverables, -Tasks und -RACI.', 1)
  on conflict (tenant_id, template_key) do nothing
  returning id into v_template_id;

  if v_template_id is null then
    -- Template already exists — resolve id, then fall through to Y-96e task-
    -- backfill + Y-96b RACI-backfill (both idempotent-if-missing).
    select id into v_template_id from public.ma_project_templates
     where tenant_id = p_tenant_id and template_key = 'buy_side_standard';
    if v_template_id is null then
      return 0;
    end if;
  else
    -- Fresh template — seed workstreams + deliverables (Y-96b writes deliverable_key).
    v_seeded := 1;
    insert into public.ma_template_workstreams (tenant_id, template_id, workstream_key, label, goal, sort_order)
    values
      (p_tenant_id, v_template_id, 'commercial', 'Commercial / Market DD', 'Markt-, Wettbewerbs- und Geschäftsmodellanalyse', 10),
      (p_tenant_id, v_template_id, 'financial',  'Financial DD',            'Analyse der Vermögens-, Finanz- und Ertragslage', 20),
      (p_tenant_id, v_template_id, 'legal',      'Legal DD',                'Rechtliche Prüfung inkl. Verträge und Streitigkeiten', 30),
      (p_tenant_id, v_template_id, 'tax',        'Tax DD',                  'Steuerliche Prüfung und Risiken', 40),
      (p_tenant_id, v_template_id, 'hr',         'HR / Organisation DD',    'Personal, Management und Organisationsstruktur', 50),
      (p_tenant_id, v_template_id, 'it',         'IT / Technology DD',      'IT-Landschaft, Systeme und technische Schulden', 60),
      (p_tenant_id, v_template_id, 'operations', 'Operations DD',           'Operative Prozesse, Supply Chain und Standorte', 70);

    insert into public.ma_template_deliverables (tenant_id, template_id, workstream_key, deliverable_key, name, sort_order)
    values
      (p_tenant_id, v_template_id, 'commercial', 'market_competitive_assessment', 'Market & Competitive Assessment', 10),
      (p_tenant_id, v_template_id, 'financial',  'financial_dd_report',           'Financial DD Report', 10),
      (p_tenant_id, v_template_id, 'financial',  'quality_of_earnings_qoe_analyse', 'Quality of Earnings (QoE) Analyse', 20),
      (p_tenant_id, v_template_id, 'legal',      'legal_dd_report',               'Legal DD Report', 10),
      (p_tenant_id, v_template_id, 'legal',      'red_flag_memo',                 'Red-Flag Memo', 20),
      (p_tenant_id, v_template_id, 'tax',        'tax_dd_report',                 'Tax DD Report', 10),
      (p_tenant_id, v_template_id, 'hr',         'hr_management_dd_report',       'HR & Management DD Report', 10),
      (p_tenant_id, v_template_id, 'it',         'it_dd_report',                  'IT DD Report', 10),
      (p_tenant_id, v_template_id, 'operations', 'operations_dd_report',          'Operations DD Report', 10);
  end if;

  -- Y-96e L5 idempotent task-backfill: only if the template has no tasks.
  select count(*) into v_task_count from public.ma_template_tasks where template_id = v_template_id;
  if v_task_count = 0 then
    insert into public.ma_template_tasks
      (tenant_id, template_id, task_key, title, description, target_kind,
       workstream_key, phase_key, parent_task_key, priority, estimated_days, due_date_offset_days, sort_order)
    values
      (p_tenant_id, v_template_id, 'commercial_kickoff',       'Kickoff Commercial DD anberaumen',
        'Termin mit externen Beratern + interner Lead festlegen.', 'task', 'commercial', null, null, 'high',   0.5, 3,  10),
      (p_tenant_id, v_template_id, 'commercial_scope',         'Scope-Dokument Commercial DD abstimmen',
        'Umfang, Fragenkatalog, Datenraum-Anforderungen.', 'task', 'commercial', null, null, 'high',   1,   5,  20),
      (p_tenant_id, v_template_id, 'commercial_market',        'Marktdaten & Wettbewerbslandschaft erheben',
        'Marktgröße, Wachstum, Wettbewerber, Trends.', 'task', 'commercial', null, null, 'medium', 5,   20, 30),
      (p_tenant_id, v_template_id, 'commercial_business_model','Business-Model-Analyse und Wertkette',
        'Erlösmodell, Value-Chain, USPs.', 'task', 'commercial', null, null, 'medium', 3,   25, 40),
      (p_tenant_id, v_template_id, 'financial_kickoff',        'Kickoff Financial DD',
        'Auftakt mit Wirtschaftsprüfer und CFO Target.', 'task', 'financial', null, null, 'high',   0.5, 3,  10),
      (p_tenant_id, v_template_id, 'financial_data_request',   'Data Request List (Finanzen) freigeben',
        'Datenraum-Anfrageliste für 3-5 Jahre Historie.', 'task', 'financial', null, null, 'high',   1,   5,  20),
      (p_tenant_id, v_template_id, 'financial_p_and_l',        'GuV-Analyse (Umsatz, Marge, Kostenblöcke)',
        'Historische GuV-Analyse inkl. Normalisierungen.', 'task', 'financial', null, null, 'high',   5,   20, 30),
      (p_tenant_id, v_template_id, 'financial_qoe',            'Quality of Earnings Analyse durchführen',
        'EBITDA-Bereinigungen, non-recurring items.', 'task', 'financial', null, null, 'high',   8,   30, 40),
      (p_tenant_id, v_template_id, 'financial_qoe_prep',       'QoE-Vorbereitung: Normalisierungen sammeln',
        'Zusammenstellung one-off items für QoE.', 'subtask', 'financial', null, 'financial_qoe', 'medium', 2,   25, 41),
      (p_tenant_id, v_template_id, 'financial_qoe_review',     'QoE-Review mit Deal Team',
        'Diskussion der Adjustments mit Buy-Side-Team.', 'subtask', 'financial', null, 'financial_qoe', 'high',   1,   32, 42),
      (p_tenant_id, v_template_id, 'financial_working_capital','Working-Capital-Analyse',
        'DSO, DPO, DIO + Trends.', 'task', 'financial', null, null, 'medium', 3,   25, 50),
      (p_tenant_id, v_template_id, 'legal_kickoff',            'Kickoff Legal DD',
        'Legal DD Auftakt mit externen Beratern.', 'task', 'legal', null, null, 'high',   0.5, 3,  10),
      (p_tenant_id, v_template_id, 'legal_material_contracts', 'Wesentliche Verträge sichten',
        'Change-of-Control-Klauseln, Kunden-/Lieferantenverträge.', 'task', 'legal', null, null, 'high',   5,   20, 20),
      (p_tenant_id, v_template_id, 'legal_disputes',           'Rechtsstreitigkeiten und Verbindlichkeiten prüfen',
        'Laufende und drohende Verfahren.', 'task', 'legal', null, null, 'medium', 3,   25, 30),
      (p_tenant_id, v_template_id, 'legal_red_flag_memo',      'Red-Flag Memo erstellen',
        'Zusammenfassung der kritischen Legal-Findings.', 'subtask', 'legal', null, 'legal_disputes', 'high', 1, 30, 31),
      (p_tenant_id, v_template_id, 'tax_kickoff',              'Kickoff Tax DD',
        'Steuerberater und Deal Team.', 'task', 'tax', null, null, 'medium', 0.5, 3,  10),
      (p_tenant_id, v_template_id, 'tax_position',             'Steuerliche Ist-Analyse',
        'Steuerpositionen, Verlustvorträge, laufende Prüfungen.', 'task', 'tax', null, null, 'high',   4,   20, 20),
      (p_tenant_id, v_template_id, 'tax_risks',                'Steuerliche Risiken bewerten',
        'Betriebsprüfungsrisiken, verdeckte Gewinnausschüttungen.', 'task', 'tax', null, null, 'medium', 3,   25, 30),
      (p_tenant_id, v_template_id, 'hr_kickoff',               'Kickoff HR DD',
        'HR-Lead Target, People Advisor abstimmen.', 'task', 'hr', null, null, 'medium', 0.5, 3,  10),
      (p_tenant_id, v_template_id, 'hr_key_people',            'Key-Personnel-Analyse',
        'Top-Management, Retention, Kündigungsrisiken.', 'task', 'hr', null, null, 'high',   3,   20, 20),
      (p_tenant_id, v_template_id, 'hr_pensions',              'Pensionsverpflichtungen prüfen',
        'DBO, Bewertung, Auslagerungsmöglichkeiten.', 'task', 'hr', null, null, 'medium', 2,   25, 30),
      (p_tenant_id, v_template_id, 'it_kickoff',               'Kickoff IT DD',
        'CIO Target + IT-Advisor.', 'task', 'it', null, null, 'medium', 0.5, 3,  10),
      (p_tenant_id, v_template_id, 'it_landscape',             'IT-Landschaft und Systeme kartieren',
        'Kernsysteme, Cloud/On-Prem, Integrationen.', 'task', 'it', null, null, 'medium', 4,   20, 20),
      (p_tenant_id, v_template_id, 'it_debt',                  'Technische Schulden und Modernisierungsbedarf bewerten',
        'Legacy-Anteil, End-of-Life-Systeme, Security-Debt.', 'task', 'it', null, null, 'medium', 3,   25, 30),
      (p_tenant_id, v_template_id, 'operations_kickoff',       'Kickoff Operations DD',
        'COO Target + Ops-Advisor.', 'task', 'operations', null, null, 'medium', 0.5, 3,  10);
  end if;

  -- Y-96b RACI-backfill: only if the template has no RACI rows. Adds the
  -- canonical Buy-Side matrix (deal_lead=A + pmo_lead=R on workstreams,
  -- sponsor=I on deliverables). Fork B1 (User-locked 2026-08-06).
  select count(*) into v_raci_count from public.ma_template_raci where template_id = v_template_id;
  if v_raci_count = 0 then
    insert into public.ma_template_raci (tenant_id, template_id, target_type, target_key, role_key, raci_letter, sort_order)
    select p_tenant_id, v_template_id, 'workstream', tw.workstream_key, 'deal_lead', 'A', 10
      from public.ma_template_workstreams tw where tw.template_id = v_template_id
    union all
    select p_tenant_id, v_template_id, 'workstream', tw.workstream_key, 'pmo_lead', 'R', 20
      from public.ma_template_workstreams tw where tw.template_id = v_template_id
    union all
    select p_tenant_id, v_template_id, 'deliverable', td.deliverable_key, 'sponsor', 'I', 10
      from public.ma_template_deliverables td where td.template_id = v_template_id;
  end if;

  return v_seeded;
end;
$$;

revoke all on function public.ensure_default_ma_project_templates(uuid) from public, anon;
grant execute on function public.ensure_default_ma_project_templates(uuid) to authenticated;

--------------------------------------------------------------------------------
-- 2. apply_ma_project_template — CONSOLIDATION: 6 atomic copy blocks in one TX:
--    phases → workstreams → deliverables → tasks-pass1 → tasks-pass2 → RACI.
--    Unified `warnings jsonb` return shape (Y-96e text[] → jsonb objects).
--------------------------------------------------------------------------------
create or replace function public.apply_ma_project_template(p_project_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_tenant           uuid;
  v_type             text;
  v_caller           uuid := auth.uid();
  v_tpl              public.ma_project_templates%rowtype;
  v_phase_result     jsonb;
  v_ws_created       int := 0;
  v_del_created      int := 0;
  v_tasks_created    int := 0;
  v_subtasks_created int := 0;
  v_raci_created     int := 0;
  v_known_roles      text[];
  v_warnings         jsonb := '[]'::jsonb;
  v_applied_at       timestamptz := now();
  v_task_row         record;
  r                  record;
  v_new_wi_id        uuid;
  v_parent_wi_id     uuid;
  v_ws_id            uuid;
  v_phase_id         uuid;
  v_target_id        uuid;
  v_result           jsonb;
begin
  select tenant_id, project_type into v_tenant, v_type
    from public.projects where id = p_project_id;
  if v_tenant is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if v_type is distinct from 'ma' then
    raise exception 'template apply is only allowed for M&A projects'
      using errcode = 'P0001';
  end if;
  if not (public.is_tenant_admin(v_tenant) or public.is_project_lead(p_project_id)) then
    raise exception 'not authorized to apply a template to this project'
      using errcode = '42501';
  end if;

  select * into v_tpl from public.ma_project_templates
   where id = p_template_id and tenant_id = v_tenant and is_active = true;
  if not found then
    raise exception 'template not found or inactive in this tenant' using errcode = 'P0002';
  end if;

  -- Hard re-apply block: workstreams have unique(project_id, workstream_key).
  if exists (select 1 from public.workstreams where project_id = p_project_id) then
    raise exception 'project already has workstreams; template can only be applied to an empty M&A project'
      using errcode = 'P0001';
  end if;

  -- Phases: reuse the deployed PROJ-95 phase-model activation (idempotent, mandate-gated phase 2).
  v_phase_result := public.activate_ma_phase_model(p_project_id);

  -- Workstreams: decoupled copy + provenance stamp.
  insert into public.workstreams
    (tenant_id, project_id, workstream_key, label, goal, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, tw.workstream_key, tw.label, tw.goal, tw.confidentiality_level, tw.sort_order,
         v_caller, v_tpl.id, v_tpl.version
    from public.ma_template_workstreams tw
   where tw.template_id = v_tpl.id;
  get diagnostics v_ws_created = row_count;

  -- Deliverables: remap workstream_key → freshly inserted workstream_id.
  insert into public.deliverables
    (tenant_id, project_id, workstream_id, name, description, status, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, w.id, td.name, td.description, td.status, td.confidentiality_level, td.sort_order,
         v_caller, v_tpl.id, v_tpl.version
    from public.ma_template_deliverables td
    join public.workstreams w
      on w.project_id = p_project_id and w.workstream_key = td.workstream_key
   where td.template_id = v_tpl.id;
  get diagnostics v_del_created = row_count;

  --------------------------------------------------------------------------
  -- Y-96e Pass 1: target_kind='task' → work_items (kind='task'), collect
  -- task_key → work_item_id map for Pass 2 subtask parenting.
  --------------------------------------------------------------------------
  create temporary table if not exists _ma_template_task_map (
    task_key text primary key,
    work_item_id uuid not null
  ) on commit drop;
  delete from _ma_template_task_map;

  for v_task_row in
    select * from public.ma_template_tasks
     where template_id = v_tpl.id and target_kind = 'task'
     order by sort_order, id
  loop
    v_ws_id := null;
    v_phase_id := null;

    if v_task_row.workstream_key is not null then
      select id into v_ws_id from public.workstreams
       where project_id = p_project_id
         and workstream_key = v_task_row.workstream_key;
      if v_ws_id is null then
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'skipped_task_missing_workstream',
          'task_key', v_task_row.task_key,
          'workstream_key', v_task_row.workstream_key
        );
        continue;
      end if;
    end if;

    if v_task_row.phase_key is not null then
      select id into v_phase_id from public.phases
       where project_id = p_project_id
         and sequence_number = v_task_row.phase_key::integer
         and is_deleted = false;
      if v_phase_id is null then
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'skipped_task_missing_phase',
          'task_key', v_task_row.task_key,
          'phase_key', v_task_row.phase_key
        );
        continue;
      end if;
    end if;

    insert into public.work_items
      (tenant_id, project_id, kind, title, description, priority,
       due_date, workstream_id, phase_id,
       source_template_id, source_template_version, created_by)
    values
      (v_tenant, p_project_id, 'task', v_task_row.title, v_task_row.description,
       coalesce(v_task_row.priority, 'medium'),
       case when v_task_row.due_date_offset_days is not null
            then current_date + v_task_row.due_date_offset_days
            else null end,
       v_ws_id, v_phase_id,
       v_tpl.id, v_tpl.version, v_caller)
    returning id into v_new_wi_id;

    insert into _ma_template_task_map (task_key, work_item_id)
      values (v_task_row.task_key, v_new_wi_id);
    v_tasks_created := v_tasks_created + 1;
  end loop;

  --------------------------------------------------------------------------
  -- Y-96e Pass 2: target_kind='subtask' → work_items (kind='subtask'),
  -- parent via map (skip if parent missing).
  --------------------------------------------------------------------------
  for v_task_row in
    select * from public.ma_template_tasks
     where template_id = v_tpl.id and target_kind = 'subtask'
     order by sort_order, id
  loop
    v_ws_id := null;
    v_phase_id := null;
    v_parent_wi_id := null;

    select work_item_id into v_parent_wi_id
      from _ma_template_task_map
     where task_key = v_task_row.parent_task_key;
    if v_parent_wi_id is null then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'skipped_subtask_parent_missing',
        'task_key', v_task_row.task_key,
        'parent_task_key', v_task_row.parent_task_key
      );
      continue;
    end if;

    if v_task_row.workstream_key is not null then
      select id into v_ws_id from public.workstreams
       where project_id = p_project_id
         and workstream_key = v_task_row.workstream_key;
      if v_ws_id is null then
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'skipped_subtask_missing_workstream',
          'task_key', v_task_row.task_key,
          'workstream_key', v_task_row.workstream_key
        );
        continue;
      end if;
    end if;

    if v_task_row.phase_key is not null then
      select id into v_phase_id from public.phases
       where project_id = p_project_id
         and sequence_number = v_task_row.phase_key::integer
         and is_deleted = false;
      if v_phase_id is null then
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'skipped_subtask_missing_phase',
          'task_key', v_task_row.task_key,
          'phase_key', v_task_row.phase_key
        );
        continue;
      end if;
    end if;

    insert into public.work_items
      (tenant_id, project_id, kind, title, description, priority,
       due_date, workstream_id, phase_id, parent_id,
       source_template_id, source_template_version, created_by)
    values
      (v_tenant, p_project_id, 'subtask', v_task_row.title, v_task_row.description,
       coalesce(v_task_row.priority, 'medium'),
       case when v_task_row.due_date_offset_days is not null
            then current_date + v_task_row.due_date_offset_days
            else null end,
       v_ws_id, v_phase_id, v_parent_wi_id,
       v_tpl.id, v_tpl.version, v_caller);
    v_subtasks_created := v_subtasks_created + 1;
  end loop;

  --------------------------------------------------------------------------
  -- Y-96b RACI copy: known-role universe (role_rates + stakeholders); loop
  -- ma_template_raci with target_key remap, emit warnings for unknown roles
  -- (row stamped anyway) and orphan targets (row skipped).
  --------------------------------------------------------------------------
  select coalesce(array_agg(distinct role_key), array[]::text[])
    into v_known_roles
    from (
      select role_key from public.role_rates   where tenant_id = v_tenant
      union
      select role_key from public.stakeholders where tenant_id = v_tenant
    ) roles
   where role_key is not null;

  for r in
    select mr.target_type, mr.target_key, trim(mr.role_key) as role_key, mr.raci_letter
      from public.ma_template_raci mr
     where mr.template_id = v_tpl.id
     order by mr.sort_order, mr.target_type, mr.target_key, mr.role_key
  loop
    v_target_id := null;
    if r.target_type = 'workstream' then
      select id into v_target_id
        from public.workstreams
       where project_id = p_project_id and workstream_key = r.target_key;
    elsif r.target_type = 'deliverable' then
      select d.id into v_target_id
        from public.deliverables d
        join public.ma_template_deliverables td
          on td.template_id = v_tpl.id and td.deliverable_key = r.target_key
       where d.project_id = p_project_id
         and d.source_template_id = v_tpl.id
         and d.name = td.name
       limit 1;
    end if;

    if v_target_id is null then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'raci_orphan_target',
        'target_type', r.target_type,
        'target_key', r.target_key,
        'role_key', r.role_key
      );
      continue;
    end if;

    if not (r.role_key = any (v_known_roles)) then
      v_warnings := v_warnings || jsonb_build_object(
        'code', 'raci_unknown_role_key',
        'target_type', r.target_type,
        'target_key', r.target_key,
        'role_key', r.role_key
      );
    end if;

    insert into public.raci_assignments
      (tenant_id, project_id, target_type, target_id, role_key, raci_letter,
       created_by, source_template_id, source_template_version)
    values
      (v_tenant, p_project_id, r.target_type, v_target_id, r.role_key, r.raci_letter,
       v_caller, v_tpl.id, v_tpl.version);
    v_raci_created := v_raci_created + 1;
  end loop;

  --------------------------------------------------------------------------
  -- PROJ-141-γ3 profile snapshot (Y-96e path).
  --------------------------------------------------------------------------
  update public.ma_project_profiles
     set source_template_id = v_tpl.id,
         source_template_label = v_tpl.name,
         source_template_version_snapshot = v_tpl.version,
         source_template_applied_at = v_applied_at
   where project_id = p_project_id;

  v_result := jsonb_build_object(
    'template_id',          v_tpl.id,
    'template_version',     v_tpl.version,
    'phase_model',          v_phase_result,
    'workstreams_created',  v_ws_created,
    'deliverables_created', v_del_created,
    'tasks_created',        v_tasks_created,
    'subtasks_created',     v_subtasks_created,
    'raci_created',         v_raci_created,
    'applied_at',           v_applied_at
  );
  if jsonb_array_length(v_warnings) > 0 then
    v_result := v_result || jsonb_build_object('warnings', v_warnings);
  end if;
  return v_result;
end;
$$;

revoke all on function public.apply_ma_project_template(uuid, uuid) from public, anon;
grant execute on function public.apply_ma_project_template(uuid, uuid) to authenticated, service_role;

comment on function public.apply_ma_project_template(uuid, uuid) is 'PROJ-96 + PROJ-Y-96b + PROJ-Y-96e (consolidation 2026-08-06): atomically seeds a fresh M&A project from a template — phases (activate_ma_phase_model) + workstreams + deliverables + tasks (Y-96e 2-pass) + RACI (Y-96b) with provenance stamps + ma_project_profiles snapshot (γ3). Unified jsonb warnings shape (code+fields).';
