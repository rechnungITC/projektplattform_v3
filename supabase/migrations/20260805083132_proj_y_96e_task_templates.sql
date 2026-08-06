-- PROJ-Y-96e — Aufgaben-Templates (ma_template_tasks).
--
-- Extends the deployed PROJ-96 catalogue (ma_project_templates + kind-tables
-- for workstreams + deliverables) with a third kind-table for template tasks.
-- Adds provenance columns to work_items so copied items carry a stamp back to
-- the template + version.
--
-- Architecture locks (see features/PROJ-Y-96e-*.md § Tech Design):
--   L1 no record_audit_changes trigger (dd_stream_templates precedent)
--   L2 provenance FK on work_items.source_template_id = ON DELETE RESTRICT
--      (parent_id remains SET NULL, orthogonal)
--   L3 two-pass task copy in apply_ma_project_template (parents first, then
--      subtasks via a temp key->id map)
--   L4 waisen-subtasks skipped (not aufgeweicht to top-level); warnings[] with
--      code-prefixes
--   L5 idempotent task-seed: template exists but has 0 tasks -> backfill once
--
-- Deviations documented in the spec:
--   D-1 estimated_days lives on ma_template_tasks but is not written to
--       work_items (target column absent; PROJ-Y-96e-e1 follow-up)
--   D-2 phase_key is text; matches phases.sequence_number::text (M&A preset
--       uses seq 1..10). All Buy-Side seed rows anchor to workstream only, so
--       phase_key is dormant until custom templates use it.

--------------------------------------------------------------------------------
-- 1. work_items provenance (additive, nullable, ON DELETE RESTRICT per L2)
--------------------------------------------------------------------------------

alter table public.work_items
  add column if not exists source_template_id uuid,
  add column if not exists source_template_version integer;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'work_items'
      and constraint_name = 'work_items_source_template_id_fkey'
  ) then
    alter table public.work_items
      add constraint work_items_source_template_id_fkey
        foreign key (source_template_id)
        references public.ma_project_templates(id)
        on delete restrict;
  end if;
end$$;

--------------------------------------------------------------------------------
-- 2. ma_template_tasks kind-table (parallel to workstreams + deliverables)
--------------------------------------------------------------------------------

create table if not exists public.ma_template_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.ma_project_templates(id) on delete cascade,
  task_key text not null,
  title text not null,
  description text,
  target_kind text not null check (target_kind in ('task','subtask')),
  workstream_key text,
  phase_key text,
  parent_task_key text,
  priority text check (priority in ('low','medium','high','critical')),
  estimated_days numeric check (estimated_days is null or estimated_days >= 0),
  due_date_offset_days integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ma_template_tasks_anchor_check
    check (workstream_key is not null or phase_key is not null),
  constraint ma_template_tasks_parent_check
    check (
      (target_kind = 'task' and parent_task_key is null)
      or (target_kind = 'subtask' and parent_task_key is not null)
    ),
  constraint ma_template_tasks_phase_key_numeric_check
    check (phase_key is null or phase_key ~ '^[0-9]+$'),
  constraint ma_template_tasks_key_unique unique (template_id, task_key)
);

create index if not exists ma_template_tasks_template_id_idx
  on public.ma_template_tasks(template_id);
create index if not exists ma_template_tasks_tenant_id_idx
  on public.ma_template_tasks(tenant_id);

alter table public.ma_template_tasks enable row level security;

drop policy if exists "ma_template_tasks read for tenant members"
  on public.ma_template_tasks;
create policy "ma_template_tasks read for tenant members"
  on public.ma_template_tasks for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists "ma_template_tasks insert for tenant admins"
  on public.ma_template_tasks;
create policy "ma_template_tasks insert for tenant admins"
  on public.ma_template_tasks for insert
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "ma_template_tasks update for tenant admins"
  on public.ma_template_tasks;
create policy "ma_template_tasks update for tenant admins"
  on public.ma_template_tasks for update
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists "ma_template_tasks delete for tenant admins"
  on public.ma_template_tasks;
create policy "ma_template_tasks delete for tenant admins"
  on public.ma_template_tasks for delete
  using (public.is_tenant_admin(tenant_id));

-- Tenant consistency: task.tenant must equal template.tenant.
-- The 4-policy RLS above stops cross-tenant writes at the surface, but the
-- trigger is defence in depth (definer paths, SECURITY DEFINER RPCs).
create or replace function public.ma_template_tasks_check_tenant_consistency()
  returns trigger
  language plpgsql
  security definer
  set search_path to public, pg_temp
as $$
declare
  v_tpl_tenant uuid;
begin
  select tenant_id into v_tpl_tenant
    from public.ma_project_templates
   where id = new.template_id;
  if v_tpl_tenant is null then
    raise exception 'ma_template_tasks.template_id % does not exist', new.template_id
      using errcode = '23503';
  end if;
  if v_tpl_tenant is distinct from new.tenant_id then
    raise exception 'ma_template_tasks.tenant_id must match template.tenant_id'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.ma_template_tasks_check_tenant_consistency() from public, anon, authenticated;

drop trigger if exists ma_template_tasks_tenant_consistency_trigger
  on public.ma_template_tasks;
create trigger ma_template_tasks_tenant_consistency_trigger
  before insert or update on public.ma_template_tasks
  for each row execute function public.ma_template_tasks_check_tenant_consistency();

drop trigger if exists set_updated_at_ma_template_tasks
  on public.ma_template_tasks;
create trigger set_updated_at_ma_template_tasks
  before update on public.ma_template_tasks
  for each row execute function extensions.moddatetime('updated_at');

--------------------------------------------------------------------------------
-- 3. apply_ma_project_template — extended with two-pass task copy (L3 + L4)
--------------------------------------------------------------------------------

create or replace function public.apply_ma_project_template(p_project_id uuid, p_template_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to public, pg_temp
as $function$
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
  v_warnings         text[] := array[]::text[];
  v_applied_at       timestamptz := now();
  v_task_row         record;
  v_new_wi_id        uuid;
  v_parent_wi_id     uuid;
  v_ws_id            uuid;
  v_phase_id         uuid;
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
   where id = p_template_id
     and tenant_id = v_tenant
     and is_active = true;
  if not found then
    raise exception 'template not found or inactive in this tenant'
      using errcode = 'P0002';
  end if;

  if exists (select 1 from public.workstreams where project_id = p_project_id) then
    raise exception 'project already has workstreams; template can only be applied to an empty M&A project'
      using errcode = 'P0001';
  end if;

  v_phase_result := public.activate_ma_phase_model(p_project_id);

  insert into public.workstreams
    (tenant_id, project_id, workstream_key, label, goal, confidentiality_level, sort_order,
     created_by, source_template_id, source_template_version)
  select v_tenant, p_project_id, tw.workstream_key, tw.label, tw.goal, tw.confidentiality_level, tw.sort_order,
         v_caller, v_tpl.id, v_tpl.version
    from public.ma_template_workstreams tw
   where tw.template_id = v_tpl.id;
  get diagnostics v_ws_created = row_count;

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

  -- L3 Pass 1: target_kind='task' -> work_items (kind='task'), collect task_key -> work_item_id map.
  create temporary table if not exists _ma_template_task_map (
    task_key text primary key,
    work_item_id uuid not null
  ) on commit drop;
  -- guard against stale entries if the temp table was created earlier in the tx
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
        v_warnings := v_warnings
          || format('skipped_task_missing_workstream:%s:%s',
                    v_task_row.task_key, v_task_row.workstream_key);
        continue;
      end if;
    end if;

    if v_task_row.phase_key is not null then
      select id into v_phase_id from public.phases
       where project_id = p_project_id
         and sequence_number = v_task_row.phase_key::integer
         and is_deleted = false;
      if v_phase_id is null then
        v_warnings := v_warnings
          || format('skipped_task_missing_phase:%s:%s',
                    v_task_row.task_key, v_task_row.phase_key);
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

  -- L3 Pass 2: target_kind='subtask' -> work_items (kind='subtask'), parent via map (L4 skip if missing).
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
      v_warnings := v_warnings
        || format('skipped_subtask_parent_missing:%s:%s',
                  v_task_row.task_key, v_task_row.parent_task_key);
      continue;
    end if;

    if v_task_row.workstream_key is not null then
      select id into v_ws_id from public.workstreams
       where project_id = p_project_id
         and workstream_key = v_task_row.workstream_key;
      if v_ws_id is null then
        v_warnings := v_warnings
          || format('skipped_subtask_missing_workstream:%s:%s',
                    v_task_row.task_key, v_task_row.workstream_key);
        continue;
      end if;
    end if;

    if v_task_row.phase_key is not null then
      select id into v_phase_id from public.phases
       where project_id = p_project_id
         and sequence_number = v_task_row.phase_key::integer
         and is_deleted = false;
      if v_phase_id is null then
        v_warnings := v_warnings
          || format('skipped_subtask_missing_phase:%s:%s',
                    v_task_row.task_key, v_task_row.phase_key);
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

  update public.ma_project_profiles
     set source_template_id = v_tpl.id,
         source_template_label = v_tpl.name,
         source_template_version_snapshot = v_tpl.version,
         source_template_applied_at = v_applied_at
   where project_id = p_project_id;

  return jsonb_build_object(
    'template_id',          v_tpl.id,
    'template_version',     v_tpl.version,
    'phase_model',          v_phase_result,
    'workstreams_created',  v_ws_created,
    'deliverables_created', v_del_created,
    'tasks_created',        v_tasks_created,
    'subtasks_created',     v_subtasks_created,
    'warnings',             to_jsonb(v_warnings),
    'applied_at',           v_applied_at
  );
end;
$function$;

revoke execute on function public.apply_ma_project_template(uuid, uuid) from public, anon;
grant execute on function public.apply_ma_project_template(uuid, uuid) to authenticated, service_role;

--------------------------------------------------------------------------------
-- 4. ensure_default_ma_project_templates — extended with idempotent task seed (L5)
--------------------------------------------------------------------------------

create or replace function public.ensure_default_ma_project_templates(p_tenant_id uuid)
  returns integer
  language plpgsql
  security definer
  set search_path to public, pg_temp
as $function$
declare
  v_template_id uuid;
  v_seeded      int := 0;
  v_task_count  int := 0;
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'not a tenant member' using errcode = '42501';
  end if;

  insert into public.ma_project_templates (tenant_id, template_key, name, deal_side, description, version)
  values (p_tenant_id, 'buy_side_standard', 'Buy-Side M&A (Standard)', 'buy',
          'Standard-Struktur für Buy-Side-M&A-Projekte: Standard-Workstreams und -Deliverables der Due Diligence.', 1)
  on conflict (tenant_id, template_key) do nothing
  returning id into v_template_id;

  if v_template_id is null then
    -- Template already exists — resolve id, then fall through to L5 task-backfill.
    -- Workstreams/deliverables from PROJ-96-α are already seeded for these tenants.
    select id into v_template_id from public.ma_project_templates
     where tenant_id = p_tenant_id and template_key = 'buy_side_standard';
    if v_template_id is null then
      return 0;
    end if;
  else
    -- Fresh template — seed workstreams + deliverables (byte-identical to PROJ-96-α).
    v_seeded := 1;
    insert into public.ma_template_workstreams (tenant_id, template_id, workstream_key, label, goal, sort_order)
    values
      (p_tenant_id, v_template_id, 'commercial', 'Commercial / Market DD', 'Markt-, Wettbewerbs- und Geschäftsmodellanalyse', 10),
      (p_tenant_id, v_template_id, 'financial',  'Financial DD',           'Analyse der Vermögens-, Finanz- und Ertragslage', 20),
      (p_tenant_id, v_template_id, 'legal',      'Legal DD',               'Rechtliche Prüfung inkl. Verträge und Streitigkeiten', 30),
      (p_tenant_id, v_template_id, 'tax',        'Tax DD',                 'Steuerliche Prüfung und Risiken', 40),
      (p_tenant_id, v_template_id, 'hr',         'HR / Organisation DD',   'Personal, Management und Organisationsstruktur', 50),
      (p_tenant_id, v_template_id, 'it',         'IT / Technology DD',     'IT-Landschaft, Systeme und technische Schulden', 60),
      (p_tenant_id, v_template_id, 'operations', 'Operations DD',          'Operative Prozesse, Supply Chain und Standorte', 70);

    insert into public.ma_template_deliverables (tenant_id, template_id, workstream_key, name, sort_order)
    values
      (p_tenant_id, v_template_id, 'commercial', 'Market & Competitive Assessment', 10),
      (p_tenant_id, v_template_id, 'financial',  'Financial DD Report', 10),
      (p_tenant_id, v_template_id, 'financial',  'Quality of Earnings (QoE) Analyse', 20),
      (p_tenant_id, v_template_id, 'legal',      'Legal DD Report', 10),
      (p_tenant_id, v_template_id, 'legal',      'Red-Flag Memo', 20),
      (p_tenant_id, v_template_id, 'tax',        'Tax DD Report', 10),
      (p_tenant_id, v_template_id, 'hr',         'HR & Management DD Report', 10),
      (p_tenant_id, v_template_id, 'it',         'IT DD Report', 10),
      (p_tenant_id, v_template_id, 'operations', 'Operations DD Report', 10);
  end if;

  -- L5 idempotent task-backfill: seed tasks once, only if the template still has none.
  -- Handles fresh templates AND existing PROJ-96-α tenants without duplicates.
  select count(*) into v_task_count from public.ma_template_tasks where template_id = v_template_id;
  if v_task_count = 0 then
    insert into public.ma_template_tasks
      (tenant_id, template_id, task_key, title, description, target_kind,
       workstream_key, phase_key, parent_task_key, priority, estimated_days, due_date_offset_days, sort_order)
    values
      -- Commercial / Market DD (4 tasks)
      (p_tenant_id, v_template_id, 'commercial_kickoff',       'Kickoff Commercial DD anberaumen',
        'Termin mit externen Beratern + interner Lead festlegen.', 'task', 'commercial', null, null, 'high',   0.5, 3,  10),
      (p_tenant_id, v_template_id, 'commercial_scope',         'Scope-Dokument Commercial DD abstimmen',
        'Umfang, Fragenkatalog, Datenraum-Anforderungen.', 'task', 'commercial', null, null, 'high',   1,   5,  20),
      (p_tenant_id, v_template_id, 'commercial_market',        'Marktdaten & Wettbewerbslandschaft erheben',
        'Marktgröße, Wachstum, Wettbewerber, Trends.', 'task', 'commercial', null, null, 'medium', 5,   20, 30),
      (p_tenant_id, v_template_id, 'commercial_business_model','Business-Model-Analyse und Wertkette',
        'Erlösmodell, Value-Chain, USPs.', 'task', 'commercial', null, null, 'medium', 3,   25, 40),
      -- Financial DD (5 tasks + 2 subtasks under financial_qoe)
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
      -- Legal DD (3 tasks + 1 subtask under legal_disputes)
      (p_tenant_id, v_template_id, 'legal_kickoff',            'Kickoff Legal DD',
        'Legal DD Auftakt mit externen Beratern.', 'task', 'legal', null, null, 'high',   0.5, 3,  10),
      (p_tenant_id, v_template_id, 'legal_material_contracts', 'Wesentliche Verträge sichten',
        'Change-of-Control-Klauseln, Kunden-/Lieferantenverträge.', 'task', 'legal', null, null, 'high',   5,   20, 20),
      (p_tenant_id, v_template_id, 'legal_disputes',           'Rechtsstreitigkeiten und Verbindlichkeiten prüfen',
        'Laufende und drohende Verfahren.', 'task', 'legal', null, null, 'medium', 3,   25, 30),
      (p_tenant_id, v_template_id, 'legal_red_flag_memo',      'Red-Flag Memo erstellen',
        'Zusammenfassung der kritischen Legal-Findings.', 'subtask', 'legal', null, 'legal_disputes', 'high', 1, 30, 31),
      -- Tax DD (3 tasks)
      (p_tenant_id, v_template_id, 'tax_kickoff',              'Kickoff Tax DD',
        'Steuerberater und Deal Team.', 'task', 'tax', null, null, 'medium', 0.5, 3,  10),
      (p_tenant_id, v_template_id, 'tax_position',             'Steuerliche Ist-Analyse',
        'Steuerpositionen, Verlustvorträge, laufende Prüfungen.', 'task', 'tax', null, null, 'high',   4,   20, 20),
      (p_tenant_id, v_template_id, 'tax_risks',                'Steuerliche Risiken bewerten',
        'Betriebsprüfungsrisiken, verdeckte Gewinnausschüttungen.', 'task', 'tax', null, null, 'medium', 3,   25, 30),
      -- HR / Organisation DD (3 tasks)
      (p_tenant_id, v_template_id, 'hr_kickoff',               'Kickoff HR DD',
        'HR-Lead Target, People Advisor abstimmen.', 'task', 'hr', null, null, 'medium', 0.5, 3,  10),
      (p_tenant_id, v_template_id, 'hr_key_people',            'Key-Personnel-Analyse',
        'Top-Management, Retention, Kündigungsrisiken.', 'task', 'hr', null, null, 'high',   3,   20, 20),
      (p_tenant_id, v_template_id, 'hr_pensions',              'Pensionsverpflichtungen prüfen',
        'DBO, Bewertung, Auslagerungsmöglichkeiten.', 'task', 'hr', null, null, 'medium', 2,   25, 30),
      -- IT / Technology DD (3 tasks)
      (p_tenant_id, v_template_id, 'it_kickoff',               'Kickoff IT DD',
        'CIO Target + IT-Advisor.', 'task', 'it', null, null, 'medium', 0.5, 3,  10),
      (p_tenant_id, v_template_id, 'it_landscape',             'IT-Landschaft und Systeme kartieren',
        'Kernsysteme, Cloud/On-Prem, Integrationen.', 'task', 'it', null, null, 'medium', 4,   20, 20),
      (p_tenant_id, v_template_id, 'it_debt',                  'Technische Schulden und Modernisierungsbedarf bewerten',
        'Legacy-Anteil, End-of-Life-Systeme, Security-Debt.', 'task', 'it', null, null, 'medium', 3,   25, 30),
      -- Operations DD (3 tasks)
      (p_tenant_id, v_template_id, 'operations_kickoff',       'Kickoff Operations DD',
        'COO Target + Ops-Advisor.', 'task', 'operations', null, null, 'medium', 0.5, 3,  10),
      (p_tenant_id, v_template_id, 'operations_processes',     'Kernprozesse und Wertschöpfung analysieren',
        'Produktionsprozesse, Supply Chain, Standorte.', 'task', 'operations', null, null, 'high',   5,   20, 20),
      (p_tenant_id, v_template_id, 'operations_capacity',      'Kapazität und Auslastung bewerten',
        'Anlagen, Auslastungsgrad, Investitionsbedarf.', 'task', 'operations', null, null, 'medium', 3,   25, 30);
    v_seeded := v_seeded + 1;
  end if;

  return v_seeded;
end;
$function$;

revoke execute on function public.ensure_default_ma_project_templates(uuid) from public, anon;
grant execute on function public.ensure_default_ma_project_templates(uuid) to authenticated, service_role;
